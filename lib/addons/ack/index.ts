// lib/certmanager_addon.ts
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import merge from "ts-deepmerge";
import { ClusterInfo, Values } from "../../spi";
import { createNamespace, setPath } from "../../utils";
import { HelmAddOn, HelmAddOnProps, HelmAddOnUserProps } from "../helm-addon";
import { serviceMappings } from './serviceMappings';
export * from "./serviceMappings";


/**
 * User provided option for the Helm Chart
 */
export interface AckAddOnProps extends HelmAddOnUserProps {
    /**
     * Required identified, must be unique within the parent stack scope.
     */
    id?: string;
    /**
     * Default Service Name
     * @default iam
     */
    serviceName?: AckServiceName;
    /**
     * Managed IAM Policy of the ack controller
     * @default IAMFullAccess
     */
    managedPolicyName?: string;
    /**
     * To Create Namespace using CDK. This should be done only for the first time.
     */    
    createNamespace?: boolean;
    /**
     * To create Service Account
     */    
    saName?: string;
}

export const enum AckServiceName

/**
 * Default props to be used when creating the Helm chart
 */
const defaultProps: AckAddOnProps = {
  name: "iam-chart",
  namespace: "ack-system",
  chart: "iam-chart",
  version: "v0.0.13",
  release: "iam-chart",
  repository: `oci://public.ecr.aws/aws-controllers-k8s/iam-chart`,
  values: {},
  managedPolicyName: "IAMFullAccess",
  createNamespace: true,
  saName: "iam-chart",
  serviceName: AckServiceName.IAM, 
  id: "IAM-ACK"
};



/**
 * Main class to instantiate the Helm chart
 */
export class AckAddOn extends HelmAddOn {

  readonly options: AckAddOnProps;
  readonly id? : string;

  constructor(props?: AckAddOnProps) {
    super(populateDefaults(defaultProps, props) as HelmAddOnProps);
    this.id = ""; // TODO add id field`
    this.options = this.props as AckAddOnProps;
    console.log(this.options);
  }

  deploy(clusterInfo: ClusterInfo): Promise<Construct> {
    const cluster = clusterInfo.cluster;

    const sa = cluster.addServiceAccount(`${this.options.chart}-sa`, {
      namespace: this.options.namespace,
      name: this.options.saName,
    });

    let values: Values = populateValues(this.options,cluster.stack.region);
    values = merge(values, this.props.values ?? {});

    if(this.options.createNamespace == true){
      // Let CDK Create the Namespace
      const namespace = createNamespace(this.options.namespace! , cluster);
      sa.node.addDependency(namespace);
    }
    
    sa.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName(this.options.managedPolicyName!));
    const chart = this.addHelmChart(clusterInfo, values);
    return Promise.resolve(chart);
  }
}

/**
 * populateValues populates the appropriate values used to customize the Helm chart
 * @param helmOptions User provided values to customize the chart
 */
function populateValues(helmOptions: AckAddOnProps, awsRegion: string): Values {
  const values = helmOptions.values ?? {};
  setPath(values, "aws.region", awsRegion);
  setPath(values,"serviceAccount.create", false);
  setPath(values,"serviceAccount.name", helmOptions.saName);
  return values;
}

/**
 * populate parameters passed or the default values from service Mappings.
 */
function populateDefaults(defaultProps: AckAddOnProps, props?: AckAddOnProps): AckAddOnProps {
  let tempProps : Partial<AckAddOnProps> = {...props ?? {}}; // since props may be empty
  tempProps.id = tempProps.id ?? defaultProps.id;
  tempProps.serviceName = tempProps.serviceName ?? defaultProps.serviceName;
  tempProps.name = tempProps.name ?? serviceMappings[tempProps.serviceName!]!.chart  ?? defaultProps.name;
  tempProps.namespace = tempProps.namespace ?? defaultProps.namespace;
  tempProps.chart = tempProps.chart ?? serviceMappings[tempProps.serviceName!]?.chart ?? defaultProps.chart;
  tempProps.version = tempProps.version ?? serviceMappings[tempProps.serviceName!]?.version ?? defaultProps.version;
  tempProps.repository = tempProps.repository ?? `oci://public.ecr.aws/aws-controllers-k8s/${tempProps.name}` ?? defaultProps.repository;
  tempProps.managedPolicyName = tempProps.managedPolicyName ?? serviceMappings[tempProps.serviceName!]?.managedPolicyName ?? defaultProps.managedPolicyName;
  tempProps.createNamespace = tempProps.createNamespace ?? defaultProps.createNamespace;
  tempProps.saName = tempProps.saName ?? `${tempProps.chart}-sa`;
  return tempProps as AckAddOnProps;
}