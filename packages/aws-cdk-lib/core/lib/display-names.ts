import type { IConstruct } from 'constructs';
import type { IAspect } from './aspect';
import { Aspects } from './aspect';
import { CfnResource } from './cfn-resource';
import { TagManager } from './tag-manager';
import { TreeInspector } from './tree';

/**
 * A function that resolves the Name tag value for a given CfnResource.
 *
 * Return `undefined` to skip tagging a specific resource.
 */
export type NameTagResolver = (node: CfnResource) => string | undefined;

/**
 * Properties for applying display names.
 */
export interface DisplayNameProps {
  /**
   * Apply the Name tag only to specific resource types.
   *
   * When specified, only resources whose CloudFormation type is in this list
   * will receive a Name tag. This overrides the default behavior of targeting
   * only resources without physical names.
   *
   * @example ['AWS::EC2::VPC', 'AWS::EC2::Subnet']
   * @default - targets resources without physical names
   */
  readonly applyToResourceTypes?: string[];

  /**
   * Exclude specific resource types from receiving a Name tag.
   *
   * @example ['AWS::EC2::VPCEndpointService']
   * @default - no exclusions
   */
  readonly excludeResourceTypes?: string[];

  /**
   * A custom function to resolve the Name tag value for each resource.
   *
   * Return `undefined` from the resolver to skip tagging a specific resource.
   *
   * @example (node) => node.node.path.split('/').slice(-2).join('/')
   * @default - uses the construct's node path
   */
  readonly nameResolver?: NameTagResolver;

  /**
   * Whether to overwrite existing Name tags.
   *
   * When `false` (default), only resources without an existing Name tag
   * will receive one. This is the safe default that preserves Name tags
   * set by L2 constructs (e.g., `Vpc` and `Subnet`).
   *
   * When `true`, all targeted resources will receive a Name tag,
   * replacing any existing Name tags.
   *
   * @default false
   */
  readonly overwrite?: boolean;

  /**
   * The priority to use when applying this aspect.
   *
   * Must be higher than `AspectPriority.MUTATING` (200) to ensure this
   * aspect runs after Tag aspects, so that `overwrite: false` can correctly
   * detect existing Name tags set by L2 constructs.
   *
   * @default 300
   */
  readonly priority?: number;
}

/**
 * Determines whether a CfnResource has a physical name property.
 *
 * Uses the `inspect()` method to retrieve the resource's CloudFormation
 * properties at runtime, then checks if any property key ends with "name"
 * (case-insensitive). Resources without a physical name property typically
 * rely on the Name tag for identification in the AWS Console.
 *
 * @internal
 */
function hasPhysicalNameProperty(resource: CfnResource): boolean {
  // inspect() is implemented by generated L1 classes (IInspectable)
  if (typeof (resource as any).inspect !== 'function') {
    return false;
  }
  const inspector = new TreeInspector();
  (resource as any).inspect(inspector);
  const props = inspector.attributes['aws:cdk:cloudformation:props'];
  if (!props || typeof props !== 'object') {
    return false;
  }

  // Extract the resource type suffix, e.g. "AWS::EC2::LaunchTemplate" -> "launchtemplate"
  const typeSuffix = resource.cfnResourceType.split('::').pop()?.toLowerCase() ?? '';

  return Object.keys(props).some((key) => {
    const lower = key.toLowerCase();
    if (!lower.endsWith('name')) {
      return false;
    }
    // Strip the "name" suffix to get the prefix, e.g. "launchTemplateName" -> "launchtemplate"
    const prefix = lower.slice(0, -4);
    // A property is considered a physical name if:
    // - the key is exactly "name", OR
    // - the resource type suffix contains the prefix
    //   e.g. "launchtemplate" contains "launchtemplate" (launchTemplateName)
    //        "securitygroup" contains "group" (groupName)
    //        "keypair" contains "key" (keyName)
    //   but NOT:
    //        "vpcendpoint" does NOT contain "service" (serviceName)
    //        "dhcpoptions" does NOT contain "domain" (domainName)
    //        "flowlog" does NOT contain "loggroup" (logGroupName)
    return prefix === '' || typeSuffix.includes(prefix);
  });
}

/**
 * Internal properties extending DisplayNameProps with additional filtering.
 * @internal
 */
interface InternalDisplayNameProps extends DisplayNameProps {
  /**
   * Only apply to resource types matching these prefixes.
   * @internal
   */
  readonly _resourceTypePrefixes?: string[];
}

/**
 * Default priority for DisplayNames aspects.
 * Must be higher than AspectPriority.MUTATING (200) so that Tag aspects
 * (which run at MUTATING priority) execute first. This allows the
 * `overwrite: false` check to correctly detect existing Name tags
 * set by L2 constructs via Tags.of().add().
 */
const DISPLAY_NAMES_PRIORITY = 300;

/**
 * Aspect that applies Name tags to targeted resources.
 */
class DisplayNameAspect implements IAspect {
  constructor(private readonly props: InternalDisplayNameProps = {}) {}

  public visit(node: IConstruct): void {
    if (!CfnResource.isCfnResource(node)) {
      return;
    }

    const cfnResource = node as CfnResource;
    const resourceType = cfnResource.cfnResourceType;

    // Prefix filter (used by applyToEc2)
    if (this.props._resourceTypePrefixes && this.props._resourceTypePrefixes.length > 0) {
      if (!this.props._resourceTypePrefixes.some((prefix) => resourceType.startsWith(prefix))) {
        return;
      }
    }

    // Exclude filter
    if (this.props.excludeResourceTypes?.includes(resourceType)) {
      return;
    }

    // Include filter: user-specified list takes precedence, otherwise use dynamic check
    if (this.props.applyToResourceTypes && this.props.applyToResourceTypes.length > 0) {
      if (!this.props.applyToResourceTypes.includes(resourceType)) {
        return;
      }
    } else if (hasPhysicalNameProperty(cfnResource)) {
      return;
    }

    // Must be taggable
    const tagManager = TagManager.of(node);
    if (!tagManager) {
      return;
    }

    // Unless overwrite is true, skip resources that already have a Name tag
    if (!this.props.overwrite && tagManager.tagValues().Name !== undefined) {
      return;
    }

    // Resolve the name value
    const name = this.props.nameResolver
      ? this.props.nameResolver(cfnResource)
      : node.node.path;

    if (name === undefined) {
      return;
    }

    // Use priority 100 (same as default Tag priority).
    // When overwrite is true, use priority 101 to win over L2 Tags.
    const tagPriority = this.props.overwrite ? 101 : 100;
    tagManager.setTag('Name', name, tagPriority);
  }
}

/**
 * Manages display names (Name tags) for resources within a construct scope.
 *
 * Many AWS resources (especially in EC2/VPC) don't have a physical name property
 * and rely on the `Name` tag as their display name in the AWS Console. CDK does
 * not consistently apply Name tags to these resources, leading to unnamed resources
 * that are difficult to identify.
 *
 * `DisplayNames` solves this by applying Name tags as an Aspect, targeting only
 * resources that lack a physical name property. By default, the construct's
 * node path is used as the Name tag value, and existing Name tags are preserved.
 *
 * @example
 * declare const stack: Stack;
 *
 * // Fill in missing Name tags (default: does not overwrite existing ones)
 * DisplayNames.of(stack).apply();
 *
 * // Overwrite all Name tags
 * DisplayNames.of(stack).apply({ overwrite: true });
 *
 * // Use a custom name resolver
 * DisplayNames.of(stack).apply({
 *   nameResolver: (node) => {
 *     const parts = node.node.path.split('/');
 *     return parts.slice(-2).join('/');
 *   },
 * });
 *
 * // Only target specific resource types
 * DisplayNames.of(stack).apply({
 *   applyToResourceTypes: ['AWS::EC2::VPC', 'AWS::EC2::Subnet'],
 * });
 *
 * // Exclude specific resource types
 * DisplayNames.of(stack).apply({
 *   excludeResourceTypes: ['AWS::EC2::VPCEndpointService'],
 * });
 *
 * // Apply only to EC2/VPC resources
 * DisplayNames.of(stack).applyToEc2();
 */
export class DisplayNames {
  /**
   * Returns the display names API for the given scope.
   */
  public static of(scope: IConstruct): DisplayNames {
    return new DisplayNames(scope);
  }

  private constructor(private readonly scope: IConstruct) {}

  /**
   * Apply a Name tag to targeted resources within this scope.
   *
   * By default, targets resources without physical names and uses
   * the construct's node path as the Name tag value. Existing Name
   * tags are preserved unless `overwrite: true` is specified.
   */
  public apply(props: DisplayNameProps = {}) {
    Aspects.of(this.scope).add(new DisplayNameAspect(props), {
      priority: props.priority ?? DISPLAY_NAMES_PRIORITY,
    });
  }

  /**
   * Convenience method: apply Name tags only to EC2/VPC resources.
   *
   * This targets the most common resources that use the Name tag
   * as their display name in the AWS Console. Only EC2 resources
   * without a physical name property will receive a Name tag.
   */
  public applyToEc2(props: Omit<DisplayNameProps, 'applyToResourceTypes'> = {}) {
    Aspects.of(this.scope).add(new DisplayNameAspect({
      ...props,
      _resourceTypePrefixes: ['AWS::EC2::'],
    }), {
      priority: props.priority ?? DISPLAY_NAMES_PRIORITY,
    });
  }
}
