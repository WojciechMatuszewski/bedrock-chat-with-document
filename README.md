# Learnings

- To get the list of files that `eslint` "found", you will need to run `eslint` with the `DEBUG` flag.

  ```sh
  DEBUG=eslint:eslint eslint .
  ```

- The `eslint` is quite hard to set up for monorepos.

  - Before the v9, we could have multiple config files in each package.

  - In v9, there is a feature flag to preserve that behavior, but I did not manage to make it work.

    - Instead, I decided it would be easier to have each package define `eslint.config.js` file separately.

- It looks like you can define both the `qualifier` AND the `toolkitName` in the `cdk.json` file.

  - This is quite nice, as you no longer have to duplicate the `qualifier` between the `cdk deploy` in `package.json` and the `qualifier` prop in the CDK code!

- It is such a pity that the `PineconeVectorStore` construct requires the credentials to use Secrets Manager.

  - I would love to switch to Parameter Store secrets and not have to pay for Secrets Manager usage.

- **The `connectionString` parameter you must pass to `PineconeVectorStore` MUST be a well-formed HTTP address**.

  - Initially, I thought that I will create a "placeholder" value for an SSM parameter and use it there, but CloudFormation rejected that update.

    - In the end, I decided to load that value via environment variables.

      - Side note: I'm very glad that Node now has a built-in way to load environment variables! [Check out the documentation here](https://nodejs.org/en/learn/command-line/how-to-read-environment-variables-from-nodejs).

- **When building the Amazon Bedrock knowledge base** the _format_ of the **value held in the secrets manager for the Pinecone API key needed to be `apiKey: VALUE`**.

  - I wonder why such constraint. Why not accept the _value_ of the secret as the _apiKey_?

- **When you create the `PineconeVectorStore` resource, the resource WILL CHECK IF THE CREDENTIALS YOU SPECIFIED ARE CORRECT**.

  - This means you **CANT create "placeholder" secrets and then fill them in AWS console**. For the secret, you have to create it manually in AWS Console, and then reference it in CFN.

- **I got stuck while trying to use a secret via `fromSecretNameV2` method**.

  - The documentation mentions that this function **returns a "partial arn"** which could lead to `AccessDenied` exceptions when using it alongside CLI or SDK.

    - According to the ChatGPT, the "partial arn" is ARN with region, and account portions omitted.

- I'm baffled by the fact that most Bedrock models (and other models as well) are not available on `eu-west-1` region.
