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

- When working with S3 POST request and parameters on the frontend, **remember that the `file` key has to be the last in the `formData` payload**.

  - AWS ignores all data that appears _after_ the `key` key.

- The `useActionState` is an interesting hook.

  - You have to annotate the file with `use client` to use it, but you can import and pass to it actions from a file annotated with `use server`.

    - I think I'm confusing the `use server` with `server-only` pragma.

      - The `use server` pragma means **"take all exports from this file and turn them into server endpoints"**.

        - This means that they can be used in both client and server contexts BUT they run on the server.

      - The `server only` pragma means **"this file can only be imported in the server context"**.

- You can make your data available to Bedrock via Knowledge bases in two ways.

  1. You can use the `StartIngestionJob` operation.
     1. Scans the entire S3 data source.
     2. Checks each document if it's already indexed in vector store.
     3. Used when you want to sync all S3 bucket changes.
  2. You can use the `IngestKnowledgeBaseDocuments` operation.
     1. Directly indexes specific documents into vector store.
     2. Skips S3 scanning step.
     3. Faster for individual document updates.
     4. Changes are NOT reflected in S3 bucket.

  So, it seems like the `StartIngestionJob` is more akin to a bach process where you want to perform updates at scale.

  The `IngestKnowledgeBaseDocuments` is for one-off updates – ideal for our use-case!

- **Both** the `StartIngestionJob` and `IngestKnowledgeBaseDocuments` are async operations.

  - I wish Step Functions would support a `.sync` task for those, but that is not the case.

- The AWS Console does not help at all with debugging failed `IngestKnowledgeBaseDocuments` job.

  - You will see them listed as "failed", but the UI fails to displays the _reason_ for the failure :C
