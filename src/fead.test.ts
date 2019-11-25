import { construct, Method, Param } from './fead'


test('construct_get', () => {
  expect(construct({
    method: Method.GET,
    address: 1,
    param: Param.UID
  })).toMatch(/^g1:255\n$/)
})

test('construct_set', () => {
  expect(construct({
    method: Method.SET,
    address: 1,
    param: Param.ADDRESS,
    value: 33
  })).toMatch(/^s1:254:33\n$/)
})

test('construct_set_multiple', () => {
  expect(construct({
    method: Method.SET,
    address: 1,
    param: Param.UID,
    value: 1,
    extraValue: 2
  })).toMatch(/^s1:255:1:2\n$/)
})
