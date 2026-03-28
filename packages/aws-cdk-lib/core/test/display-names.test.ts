
import { Construct } from 'constructs';
import { CfnResource, Stack, TagManager, TagType, Tags } from '../lib';
import { DisplayNames } from '../lib/display-names';
import { synthesize } from '../lib/private/synthesis';

// Taggable resource helpers. Duck-typed cdkTagManager (ITaggableV2 compatible).

class FakeVpc extends CfnResource {
  public static readonly CFN_RESOURCE_TYPE_NAME = 'AWS::EC2::VPC';
  public readonly cdkTagManager: TagManager;
  constructor(scope: Construct, id: string) {
    super(scope, id, { type: FakeVpc.CFN_RESOURCE_TYPE_NAME });
    this.cdkTagManager = new TagManager(TagType.STANDARD, FakeVpc.CFN_RESOURCE_TYPE_NAME);
  }
}

class FakeSubnet extends CfnResource {
  public static readonly CFN_RESOURCE_TYPE_NAME = 'AWS::EC2::Subnet';
  public readonly cdkTagManager: TagManager;
  constructor(scope: Construct, id: string) {
    super(scope, id, { type: FakeSubnet.CFN_RESOURCE_TYPE_NAME });
    this.cdkTagManager = new TagManager(TagType.STANDARD, FakeSubnet.CFN_RESOURCE_TYPE_NAME);
  }
}

class FakeBucket extends CfnResource {
  public static readonly CFN_RESOURCE_TYPE_NAME = 'AWS::S3::Bucket';
  public readonly cdkTagManager: TagManager;
  constructor(scope: Construct, id: string) {
    super(scope, id, { type: FakeBucket.CFN_RESOURCE_TYPE_NAME });
    this.cdkTagManager = new TagManager(TagType.STANDARD, FakeBucket.CFN_RESOURCE_TYPE_NAME);
  }
  // Simulate an L1 resource with a physical name property
  public inspect(inspector: any) {
    inspector.addAttribute('aws:cdk:cloudformation:props', { bucketName: 'my-bucket' });
  }
}

class FakeVpcEndpoint extends CfnResource {
  public static readonly CFN_RESOURCE_TYPE_NAME = 'AWS::EC2::VPCEndpoint';
  public readonly cdkTagManager: TagManager;
  constructor(scope: Construct, id: string) {
    super(scope, id, { type: FakeVpcEndpoint.CFN_RESOURCE_TYPE_NAME });
    this.cdkTagManager = new TagManager(TagType.STANDARD, FakeVpcEndpoint.CFN_RESOURCE_TYPE_NAME);
  }
  // serviceName ends with "name" but is NOT a physical name for this resource
  public inspect(inspector: any) {
    inspector.addAttribute('aws:cdk:cloudformation:props', { serviceName: 'com.amazonaws.us-east-1.s3' });
  }
}

class FakeVpcEndpointService extends CfnResource {
  public static readonly CFN_RESOURCE_TYPE_NAME = 'AWS::EC2::VPCEndpointService';
  public readonly cdkTagManager: TagManager;
  constructor(scope: Construct, id: string) {
    super(scope, id, { type: FakeVpcEndpointService.CFN_RESOURCE_TYPE_NAME });
    this.cdkTagManager = new TagManager(TagType.STANDARD, FakeVpcEndpointService.CFN_RESOURCE_TYPE_NAME);
  }
}

class FakeInternetGateway extends CfnResource {
  public static readonly CFN_RESOURCE_TYPE_NAME = 'AWS::EC2::InternetGateway';
  public readonly cdkTagManager: TagManager;
  constructor(scope: Construct, id: string) {
    super(scope, id, { type: FakeInternetGateway.CFN_RESOURCE_TYPE_NAME });
    this.cdkTagManager = new TagManager(TagType.STANDARD, FakeInternetGateway.CFN_RESOURCE_TYPE_NAME);
  }
}

class FakeKmsKey extends CfnResource {
  public static readonly CFN_RESOURCE_TYPE_NAME = 'AWS::KMS::Key';
  public readonly cdkTagManager: TagManager;
  constructor(scope: Construct, id: string) {
    super(scope, id, { type: FakeKmsKey.CFN_RESOURCE_TYPE_NAME });
    this.cdkTagManager = new TagManager(TagType.STANDARD, FakeKmsKey.CFN_RESOURCE_TYPE_NAME);
  }
}

describe('DisplayNames', () => {
  test('applies Name tag to resources without physical names', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpc = new FakeVpc(stack, 'MyVpc');
    const subnet = new FakeSubnet(stack, 'MySubnet');

    DisplayNames.of(stack).apply();
    synthesize(stack);

    expect(vpc.cdkTagManager.tagValues().Name).toBe('TestStack/MyVpc');
    expect(subnet.cdkTagManager.tagValues().Name).toBe('TestStack/MySubnet');
  });

  test('does not apply Name tag to resources with physical names', () => {
    const stack = new Stack(undefined, 'TestStack');
    const bucket = new FakeBucket(stack, 'MyBucket');

    DisplayNames.of(stack).apply();
    synthesize(stack);

    expect(bucket.cdkTagManager.tagValues().Name).toBeUndefined();
  });

  test('does not apply Name tag to resources with physical names even when overwrite is true', () => {
    const stack = new Stack(undefined, 'TestStack');
    const bucket = new FakeBucket(stack, 'MyBucket');
    bucket.cdkTagManager.setTag('Name', 'existing-name', 100);

    DisplayNames.of(stack).apply({ overwrite: true });
    synthesize(stack);

    expect(bucket.cdkTagManager.tagValues().Name).toBe('existing-name');
  });

  test('does not overwrite existing Name tag set directly on TagManager', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpc = new FakeVpc(stack, 'MyVpc');
    vpc.cdkTagManager.setTag('Name', 'my-custom-vpc', 100);

    DisplayNames.of(stack).apply();
    synthesize(stack);

    expect(vpc.cdkTagManager.tagValues().Name).toBe('my-custom-vpc');
  });

  test('does not overwrite Name tag set via Tags.of() aspect', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpc = new FakeVpc(stack, 'MyVpc');

    Tags.of(vpc).add('Name', 'L2-provided-name');

    DisplayNames.of(stack).apply();
    synthesize(stack);

    expect(vpc.cdkTagManager.tagValues().Name).toBe('L2-provided-name');
  });

  test('overwrites existing Name tag when overwrite is true', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpc = new FakeVpc(stack, 'MyVpc');
    vpc.cdkTagManager.setTag('Name', 'old-name', 100);

    DisplayNames.of(stack).apply({ overwrite: true });
    synthesize(stack);

    expect(vpc.cdkTagManager.tagValues().Name).toBe('TestStack/MyVpc');
  });

  test('overwrites Name tag set via Tags.of() aspect when overwrite is true', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpc = new FakeVpc(stack, 'MyVpc');

    Tags.of(vpc).add('Name', 'L2-provided-name');

    DisplayNames.of(stack).apply({ overwrite: true });
    synthesize(stack);

    expect(vpc.cdkTagManager.tagValues().Name).toBe('TestStack/MyVpc');
  });

  test('preserves self-applied Name when parent also propagates Name', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpcConstruct = new Construct(stack, 'MyVpc');
    const subnet = new FakeSubnet(vpcConstruct, 'PublicSubnet1');

    Tags.of(vpcConstruct).add('Name', 'TestStack/MyVpc');
    Tags.of(subnet).add('Name', 'TestStack/MyVpc/PublicSubnet1');

    DisplayNames.of(stack).apply();
    synthesize(stack);

    expect(subnet.cdkTagManager.tagValues().Name).toBe('TestStack/MyVpc/PublicSubnet1');
  });

  test('overwrites self-applied Name when parent also propagates Name and overwrite is true', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpcConstruct = new Construct(stack, 'MyVpc');
    const subnetConstruct = new Construct(vpcConstruct, 'PublicSubnet1');
    const cfnSubnet = new FakeSubnet(subnetConstruct, 'Subnet');

    Tags.of(vpcConstruct).add('Name', 'TestStack/MyVpc');
    Tags.of(subnetConstruct).add('Name', 'TestStack/MyVpc/PublicSubnet1');

    DisplayNames.of(stack).apply({ overwrite: true });
    synthesize(stack);

    expect(cfnSubnet.cdkTagManager.tagValues().Name).toBe('TestStack/MyVpc/PublicSubnet1/Subnet');
  });

  test('preserves propagated Name from parent when resource has no self-applied Name', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpcConstruct = new Construct(stack, 'MyVpc');
    const igw = new FakeInternetGateway(vpcConstruct, 'IGW');

    Tags.of(vpcConstruct).add('Name', 'TestStack/MyVpc');

    DisplayNames.of(stack).apply();
    synthesize(stack);

    expect(igw.cdkTagManager.tagValues().Name).toBe('TestStack/MyVpc');
  });

  test('overwrites propagated Name from parent when overwrite is true', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpcConstruct = new Construct(stack, 'MyVpc');
    const igw = new FakeInternetGateway(vpcConstruct, 'IGW');

    Tags.of(vpcConstruct).add('Name', 'TestStack/MyVpc');

    DisplayNames.of(stack).apply({ overwrite: true });
    synthesize(stack);

    expect(igw.cdkTagManager.tagValues().Name).toBe('TestStack/MyVpc/IGW');
  });

  test('applies Name tag to resource with no existing Name and no propagation', () => {
    const stack = new Stack(undefined, 'TestStack');
    const igw = new FakeInternetGateway(stack, 'MyIGW');

    DisplayNames.of(stack).apply();
    synthesize(stack);

    expect(igw.cdkTagManager.tagValues().Name).toBe('TestStack/MyIGW');
  });

  test('applies Name tag to resource with no existing Name and no propagation when overwrite is true', () => {
    const stack = new Stack(undefined, 'TestStack');
    const igw = new FakeInternetGateway(stack, 'MyIGW');

    DisplayNames.of(stack).apply({ overwrite: true });
    synthesize(stack);

    expect(igw.cdkTagManager.tagValues().Name).toBe('TestStack/MyIGW');
  });

  test('uses custom nameResolver', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpc = new FakeVpc(stack, 'MyVpc');

    DisplayNames.of(stack).apply({
      nameResolver: (node) => {
        const parts = node.node.path.split('/');
        return parts[parts.length - 1];
      },
    });
    synthesize(stack);

    expect(vpc.cdkTagManager.tagValues().Name).toBe('MyVpc');
  });

  test('nameResolver returning undefined skips the resource', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpc = new FakeVpc(stack, 'MyVpc');
    const subnet = new FakeSubnet(stack, 'MySubnet');

    DisplayNames.of(stack).apply({
      nameResolver: (node) => {
        if (node.cfnResourceType === 'AWS::EC2::Subnet') return undefined;
        return node.node.path;
      },
    });
    synthesize(stack);

    expect(vpc.cdkTagManager.tagValues().Name).toBe('TestStack/MyVpc');
    expect(subnet.cdkTagManager.tagValues().Name).toBeUndefined();
  });

  test('excludeResourceTypes filters out specified types', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpc = new FakeVpc(stack, 'MyVpc');
    const endpoint = new FakeVpcEndpointService(stack, 'MyEndpoint');

    DisplayNames.of(stack).apply({
      excludeResourceTypes: ['AWS::EC2::VPCEndpointService'],
    });
    synthesize(stack);

    expect(vpc.cdkTagManager.tagValues().Name).toBe('TestStack/MyVpc');
    expect(endpoint.cdkTagManager.tagValues().Name).toBeUndefined();
  });

  test('applyToResourceTypes overrides the built-in physical name check', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpc = new FakeVpc(stack, 'MyVpc');
    const bucket = new FakeBucket(stack, 'MyBucket');

    DisplayNames.of(stack).apply({
      applyToResourceTypes: ['AWS::S3::Bucket'],
    });
    synthesize(stack);

    expect(vpc.cdkTagManager.tagValues().Name).toBeUndefined();
    expect(bucket.cdkTagManager.tagValues().Name).toBe('TestStack/MyBucket');
  });

  test('does not tag non-taggable resources', () => {
    const stack = new Stack(undefined, 'TestStack');
    const rt = new CfnResource(stack, 'MyRouteTable', { type: 'AWS::EC2::RouteTable' });

    DisplayNames.of(stack).apply();
    synthesize(stack);

    expect(TagManager.of(rt)).toBeUndefined();
  });

  test('applies Name tag to VPCEndpoint where serviceName is not a physical name', () => {
    const stack = new Stack(undefined, 'TestStack');
    const endpoint = new FakeVpcEndpoint(stack, 'MyEndpoint');

    DisplayNames.of(stack).apply();
    synthesize(stack);

    expect(endpoint.cdkTagManager.tagValues().Name).toBe('TestStack/MyEndpoint');
  });

  test('applyToEc2 only targets EC2 resources', () => {
    const stack = new Stack(undefined, 'TestStack');
    const vpc = new FakeVpc(stack, 'MyVpc');
    const key = new FakeKmsKey(stack, 'MyKey');

    DisplayNames.of(stack).applyToEc2();
    synthesize(stack);

    expect(vpc.cdkTagManager.tagValues().Name).toBe('TestStack/MyVpc');
    expect(key.cdkTagManager.tagValues().Name).toBeUndefined();
  });

  test('only applies to resources within the given scope', () => {
    const stack = new Stack(undefined, 'TestStack');
    const parent = new Construct(stack, 'Parent');
    const vpc = new FakeVpc(parent, 'MyVpc');
    const outsideVpc = new FakeVpc(stack, 'OutsideVpc');

    DisplayNames.of(parent).apply();
    synthesize(stack);

    expect(vpc.cdkTagManager.tagValues().Name).toBe('TestStack/Parent/MyVpc');
    expect(outsideVpc.cdkTagManager.tagValues().Name).toBeUndefined();
  });
});
