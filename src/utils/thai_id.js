import { randomString } from './random';

export function randomThaiIdNumber() {
  const randomNumberStr = randomString(12, '0123456789');

  let sum = 0;
  for (let i = 0; i < randomNumberStr.length; i++) {
    const n = parseInt(randomNumberStr[i]);
    sum = sum + ((14 - (i+1)) * n);
  }
  const x = sum % 11;

  let lastNumber;
  if (x <= 1) {
    lastNumber = 1 - x;
  } else {
    lastNumber = 11 - x;
  }

  return randomNumberStr + lastNumber.toString();
}
