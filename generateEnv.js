const { Wallet } = require("ethers");
const fs = require('fs');
const path = require('path');

const main = async () => {
  const newWallet = Wallet.createRandom();
  console.log(newWallet.address);

  const envFilePath = path.join(__dirname, '.env');
  fs.writeFileSync(envFilePath, `PRIVATE_KEY=${newWallet.privateKey}`);
  console.log('Private key generated and saved to .env file:');
}

main().then(() => {
  console.log('finished')
});