const { getCurrentNetwork, getContractDeployments } = require('./utils/network');

const synths = ['BTC', 'ETH', 'LINK'];

const manifest = [];

getContractDeployments('FuturesMarketManager').forEach((a, i) => {
  manifest.push({
    kind: 'ethereum/contract',
    name: `futures_FuturesMarketManager_${i}`,
    network: getCurrentNetwork(),
    source: {
      address: a.address,
      startBlock: a.startBlock,
      abi: 'FuturesMarketManager',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.5',
      language: 'wasm/assemblyscript',
      file: '../src/futures.ts',
      entities: ['FuturesMarket'],
      abis: [
        {
          name: 'FuturesMarket',
          file: '../abis/FuturesMarket.json',
        },
        {
          name: 'FuturesMarketManager',
          file: '../abis/FuturesMarketManager.json',
        },
      ],
      eventHandlers: [
        {
          event: 'MarketAdded(address,indexed bytes32,indexed bytes32)',
          handler: 'handleMarketAdded',
        },
        {
          event: 'MarketRemoved(address,indexed bytes32,indexed bytes32)',
          handler: 'handleMarketRemoved',
        },
      ],
    },
  });
});

synths.forEach((synth, i) => {
  getContractDeployments(`FuturesMarket${synth}`).forEach((a, i) => {
    manifest.push({
      kind: 'ethereum/contract',
      name: `futures_FuturesMarket_${i}`,
      network: getCurrentNetwork(),
      source: {
        address: a.address,
        startBlock: a.startBlock,
        abi: 'FuturesMarket',
      },
      mapping: {
        kind: 'ethereum/events',
        apiVersion: '0.0.5',
        language: 'wasm/assemblyscript',
        file: '../src/futures.ts',
        entities: ['FuturesMarket', 'FuturesPosition', 'FuturesTrade'],
        abis: [
          {
            name: 'FuturesMarket',
            file: '../abis/FuturesMarket.json',
          },
        ],
        eventHandlers: [
          {
            event: 'MarginTransferred(indexed address,int256)',
            handler: 'handleMarginTransferredBTC',
          },
          {
            event: 'PositionModified(indexed uint256,indexed address,uint256,int256,int256,uint256,uint256,uint256)',
            handler: 'handlePositionModified',
          },
          {
            event: 'PositionLiquidated(indexed uint256,indexed address,indexed address,int256,uint256,uint256)',
            handler: 'handlePositionLiquidated',
          },
        ],
      },
    });
  });
});

module.exports = {
  specVersion: '0.0.2',
  description: 'Kwenta Futures API',
  repository: 'https://github.com/kwenta/kwenta-subgraph',
  schema: {
    file: './futures.graphql',
  },
  dataSources: manifest,
};
