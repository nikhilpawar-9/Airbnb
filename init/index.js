const mongoose = require('mongoose');
const initData = require("./data.js");
const Listing = require("../models/listing.js");

const mongoURL = 'mongodb://127.0.0.1:27017/wanderlust';

async function main() {
  await mongoose.connect(mongoURL);

  await Listing.deleteMany({});
  await Listing.insertMany(initData.data);
  console.log('Listings inserted successfully');
  await mongoose.connection.close();
}

main().then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Error seeding database:', err);
});