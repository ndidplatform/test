import * as utils from '../utils';

/*
{
  '9d1fef01b78f395f3b3551a41b80330038dbfb0b4879c6cb34e93659315877e4': <Buffer 64 63 6f 6e 74 72 61 63 74 20 74 65 73 74 31>,
  'c94192554f552f60646ce91a337c3b8519b09c91e8366966b8a75f0431d9872c': <Buffer 64 63 6f 6e 74 72 61 63 74 20 74 65 73 74 32>,
  'dd70ea42bf138777da3af75663003144cedb1d7900793b29f122d39d9b1e63d7': <Buffer 64 63 6f 6e 74 72 61 63 74 20 74 65 73 74 33>,
  'd44d485b40467623635d205e1a254d286eecf770f5617b53d286282c21546b2e': <Buffer 64 63 6f 6e 74 72 61 63 74 20 74 65 73 74 34>,
  '58cd2090e9fe339c1a9773ffa12d3eafcce440600f0613306c7e8c88de928de5': <Buffer 64 63 6f 6e 74 72 61 63 74 20 74 65 73 74 35>
}
*/

const testData = [
  Buffer.from(`dcontract test1`),
  Buffer.from(`dcontract test2`),
  Buffer.from(`dcontract test3`),
  Buffer.from(`dcontract test4`),
  Buffer.from(`dcontract test5`),
];

export const testDataWithHash = {};
export const testDataWithHashArr = testData.map((data) => {
  const hash = utils.sha256(data);

  const hashHex = hash.toString('hex');

  testDataWithHash[hashHex] = data;

  return {
    data,
    hashHex,
  };
});
