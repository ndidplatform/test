const request = require('request-promise');

describe('replyParty', () => {
  it('example', async () => {
    expect.assertions(1)

    const result = await request({
      method: 'GET',
      uri: 'https://jsonplaceholder.typicode.com/users/1',
      json: true
    })

    expect(result.email).toEqual('Sincere@april.biz')
  })
})
