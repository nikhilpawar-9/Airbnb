const express = require('express');
const app = express();
const mongoose = require('mongoose');
const Listing = require('./models/listing');
const path = require('path');
const methodOverride = require('method-override');
const ejsMate = require('ejs-mate');
const wrapAsync = require('./utils/wrapAsync');
const ExpressError = require('./utils/ExpressError');
const {listingSchema} = require("./schema")

const mongoURL = 'mongodb://127.0.0.1:27017/wanderlust';

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.engine("ejs", ejsMate);

app.get('/', (req, res) => {
    res.send('Hello, World!');
});

const validateListing = (req, res, next) => {
  const {error} = listingSchema.validate(req.body);
    if(error){
      throw new ExpressError(400, error)
    }else{
      next();
    }
}

// Index route
app.get("/listings", wrapAsync(async (req, res) => {
    const listings = await Listing.find({});
    res.render("listings/index.ejs", { listings });
}));

//New or Create route
app.get("/listings/new", (req, res) => {
    res.render("listings/new.ejs");
});

app.post("/listings", validateListing, wrapAsync(async (req, res, next) => {
    const newListing = new Listing(req.body.listing);
    await newListing.save();
    res.redirect("/listings");
}));

// Edit & update route
app.get("/listings/:id/edit", wrapAsync(async (req, res) => {
   const listing = await Listing.findById(req.params.id);
   res.render("listings/edit.ejs", { listing });
}));

app.put("/listings/:id/update", validateListing, wrapAsync(async (req, res) => {
  await Listing.findByIdAndUpdate(req.params.id, {...req.body.listing });
    res.redirect("/listings");
}));

// Delete route
app.delete("/listings/:id/delete", wrapAsync(async (req, res) => {
    await Listing.findByIdAndDelete(req.params.id);
    res.redirect("/listings");
}));

// Show route for individual listing
app.get("/listings/:id", wrapAsync(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    res.render("listings/show.ejs", { listing });
}));


app.all('/{*splat}', (req, res, next) => {
    next(new ExpressError(404, 'Page Not Found'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  let { statusCode = 500, message = 'Something went wrong' } = err;
  console.error(err);
  res.status(statusCode).render("error.ejs", { err });
});

const port = 8080;
mongoose.connect(mongoURL)
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err);
  });  