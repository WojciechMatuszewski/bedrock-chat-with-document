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
