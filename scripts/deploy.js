/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const fs = require('fs');
const path = require('path');
const { green, cyan, gray } = require('chalk');
const program = require('commander');
const inquirer = require('inquirer');
const { execSync } = require('child_process');
const { print } = require('graphql');
const { mergeTypeDefs } = require('@graphql-tools/merge');

const parseBoolean = (val) => {
  return val == 'false' ? false : val;
};

program
  .option('-a, --update-abis [value]', 'Update the Synthetix package and contract ABIs', parseBoolean)
  .option('-m, --generate-main [value]', 'Generate the main subgraph', parseBoolean)
  .option('-s --subgraph <value>', 'The subgraph to deploy to the hosted service')
  .option('-t --team <value>', 'The Graph team name')
  .option('-a --access-token <value>', 'The Graph access token')
  .option('-n --network <value>', 'Network to deploy on for the hosted service')
  .option('-d, --deploy-decentralized [value]', 'Deploy to the decentralized network', parseBoolean)
  .option('-v, --version-label [value]', 'Version label for the deployment to the decentralized network');

program.action(async () => {
  const NETWORK_CHOICES = ['mainnet', 'kovan', 'optimism', 'optimism-kovan'];
  const SUBGRAPH_CHOICES = await fs.readdirSync(path.join(__dirname, '../subgraphs')).reduce((acc, val) => {
    if (val.endsWith('.js') && val !== 'main.js') {
      acc.push(val.slice(0, -3));
    }
    return acc;
  }, []);
  const OPTIONS = program.opts();

  console.log(cyan('Updating the Synthetix package and contract ABIs...'));
  let response = await inquirer.prompt([{ name: 'updateAbis', type: 'confirm', message: 'Continue?' }], OPTIONS);
  if (response.updateAbis) {
    await execSync(`npm install synthetix@latest`);
    console.log(green('Successfully updated the Synthetix package for the most recent contracts.'));
    await execSync(`node scripts/helpers/prepare-abis.js`);
    console.log(green('Successfully prepared the ABI files for subgraph generation.'));
  }

  console.log(cyan('Generating the main subgraph...'));
  response = await inquirer.prompt(
    [{ name: 'generateMain', type: 'confirm', message: 'Continue?' }],
    Object.assign(OPTIONS, response),
  );
  if (response.generateMain) {
    // We merge using this strategy to avoid duplicates from the fragments
    let typesArray = [];
    for (let i = 0; i < SUBGRAPH_CHOICES.length; i++) {
      typesArray.push(
        (await fs.readFileSync(path.join(__dirname, `../subgraphs/${SUBGRAPH_CHOICES[i]}.graphql`))).toString(),
      );
    }
    const typeDefs = mergeTypeDefs(typesArray);

    // https://www.graphql-tools.com/docs/schema-merging#print-merged-typedefs
    const AUTOGEN_NOTICE = `""" THIS FILE IS AUTOMATICALLY GENERATED BY THE DEPLOY SCRIPT """\n\n `;
    const printedTypeDefs = print(typeDefs);
    fs.writeFileSync('subgraphs/main.graphql', AUTOGEN_NOTICE + printedTypeDefs);
    console.log(green('Successfully generated the main subgraph.'));
  }

  response = await inquirer.prompt(
    [
      {
        message:
          'Which subgraph would you like to deploy? ' +
          gray('You should only deploy subgraphs other than the main subgraph for development and testing.'),
        name: 'subgraph',
        type: 'list',
        default: 'main',
        choices: [{ name: 'Main Subgraph', value: 'main' }, new inquirer.Separator(), ...SUBGRAPH_CHOICES],
      },
      {
        message: 'What is your team name on The Graph?',
        name: 'team',
        default: 'synthetixio-team',
      },
      {
        message: 'What is your access token for The Graph?',
        name: 'accessToken',
      },
    ],
    Object.assign(OPTIONS, response),
  );

  console.log(gray('Executing prebuild steps:'));

  console.log(cyan('Running The Graph’s codegen...'));
  for (let i = 0; i < SUBGRAPH_CHOICES.length; i++) {
    const subgraph = SUBGRAPH_CHOICES[i];
    await execSync(
      `SNX_NETWORK=mainnet SUBGRAPH=${subgraph} ./node_modules/.bin/graph codegen ./subgraphs/${subgraph}.js -o ./generated/subgraphs/${subgraph}`,
    );
  }

  console.log(cyan('Creating contracts...'));
  await execSync(`node ./scripts/helpers/create-contracts`);

  if (response.subgraph !== 'rates' && fs.existsSync(`./generated/subgraphs/${response.subgraph}/ChainlinkMultisig`)) {
    console.log(cyan('Moving ChainlinkMultisig...'));
    await execSync(
      `mv generated/subgraphs/${response.subgraph}/ChainlinkMultisig generated/subgraphs/rates/ChainlinkMultisig`,
    );
  }

  response = await inquirer.prompt(
    [
      {
        message: 'Where would you like to deploy the subgraphs on the hosted service?',
        name: 'network',
        type: 'list',
        default: 'All',
        choices: ['All', 'None', new inquirer.Separator(), ...NETWORK_CHOICES],
      },
    ],
    Object.assign(OPTIONS, response),
  );

  const networkPrefix = (network) => {
    return network == 'mainnet' ? '' : network + '-';
  };

  if (response.network !== 'None') {
    console.log(cyan('Building and deploying the subgraphs to the hosted service...'));
    if (response.network == 'All') {
      for (let i = 0; i < NETWORK_CHOICES.length; i++) {
        const network = NETWORK_CHOICES[i];
        await execSync(
          `SNX_NETWORK=${network} SUBGRAPH=${response.subgraph} ./node_modules/.bin/graph build ./subgraphs/${response.subgraph}.js -o ./build/${network}/subgraphs/${response.subgraph}`,
        );
        await execSync(
          `SNX_NETWORK=${network} ./node_modules/.bin/graph deploy --node https://api.thegraph.com/deploy/ --ipfs https://api.thegraph.com/ipfs/ --access-token ${
            response.access_token
          } ${response.team}/${networkPrefix(network)}${response.subgraph} ./subgraphs/${response.subgraph}.js`,
        );
        console.log(green(`Successfully deployed to ${network} on the hosted service.`));
      }
    } else {
      await execSync(
        `SNX_NETWORK=${response.network} SUBGRAPH=${response.subgraph} ./node_modules/.bin/graph build ./subgraphs/${response.subgraph}.js -o ./build/${response.network}/subgraphs/${response.subgraph}`,
      );
      await execSync(
        `SNX_NETWORK=${
          response.network
        } ./node_modules/.bin/graph deploy --node https://api.thegraph.com/deploy/ --ipfs https://api.thegraph.com/ipfs/ --access-token ${
          response.access_token
        } ${response.team}/${networkPrefix(response.network)}${response.subgraph} ./subgraphs/${response.subgraph}.js`,
      );
      console.log(green(`Successfully deployed to ${response.network} on the hosted service.`));
    }
  }

  response = await inquirer.prompt(
    [
      {
        message: 'Would you like to deploy to the main subgraph to the decentralized network?',
        name: 'deployDecentralized',
        type: 'confirm',
      },
    ],
    Object.assign(OPTIONS, response),
  );

  if (response.deployDecentralized) {
    const { version: defaultVersion } = require('../node_modules/synthetix/package.json');
    response = await inquirer.prompt(
      [
        {
          message: 'What version label should be used for this release?',
          name: 'versionLabel',
          default: defaultVersion,
        },
      ],
      Object.assign(OPTIONS, response),
    );

    console.log('Deploying to decentralized network...');
    await execSync(
      `npx graph deploy --studio ${response.team} --version-label ${response.versionLabel} --access-token  ${response.access_token} ./subgraphs/main.js`,
    );
    console.log(green('Successfully deployed to decentralized network.'));
  }
});

program.parse(process.argv);
