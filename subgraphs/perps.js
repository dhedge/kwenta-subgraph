const { getCurrentNetwork, getContractDeployments } = require('./utils/network');

const manifest = [];

// futures market manager
getContractDeployments('FuturesMarketManager').forEach((a, i) => {
  manifest.push({
    kind: 'ethereum/contract',
    name: `futures_FuturesMarketManager_${i}`,
    network: getCurrentNetwork(),
    source: {
      address: a.address,
      startBlock: 0,
      abi: 'FuturesMarketManager',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.6',
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
          handler: 'handleV2MarketAdded',
        },
        {
          event: 'MarketRemoved(address,indexed bytes32,indexed bytes32)',
          handler: 'handleMarketRemoved',
        },
      ],
    },
  });
});

// perps v2 markets
const perpsMarketTemplate = {
  kind: 'ethereum/contract',
  name: 'PerpsMarket',
  network: getCurrentNetwork(),
  source: {
    abi: 'PerpsV2MarketProxyable',
  },
  mapping: {
    kind: 'ethereum/events',
    apiVersion: '0.0.6',
    language: 'wasm/assemblyscript',
    file: '../src/futures.ts',
    entities: ['FuturesMarket', 'FuturesPosition', 'FuturesTrade'],
    abis: [
      {
        name: 'PerpsV2MarketProxyable',
        file: '../abis/PerpsV2MarketProxyable.json',
      },
    ],
    eventHandlers: [
      {
        event: 'MarginTransferred(indexed address,int256)',
        handler: 'handleMarginTransferred',
      },
      {
        event: 'PositionModified(indexed uint256,indexed address,uint256,int256,int256,uint256,uint256,uint256)',
        handler: 'handlePositionModified',
      },
      {
        event: 'PositionLiquidated(uint256,address,address,int256,uint256,uint256)',
        handler: 'handlePositionLiquidated',
      },
      {
        event: 'DelayedOrderSubmitted(indexed address,bool,int256,uint256,uint256,uint256,uint256,uint256,bytes32)',
        handler: 'handleDelayedOrderSubmitted',
      },
      {
        event: 'DelayedOrderRemoved(indexed address,bool,uint256,int256,uint256,uint256,uint256,bytes32)',
        handler: 'handleDelayedOrderRemoved',
      },
    ],
  },
};

module.exports = {
  specVersion: '0.0.4',
  description: 'Kwenta Futures API',
  repository: 'https://github.com/kwenta/kwenta-subgraph',
  schema: {
    file: './futures.graphql',
  },
  dataSources: manifest,
  templates: [perpsMarketTemplate],
};
