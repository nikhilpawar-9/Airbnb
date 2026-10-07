require("dotenv").config();
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const Listing = require('./models/listing');
const User = require('./models/user');
const Review = require("./models/review");
const Booking = require("./models/booking");
const path = require('path');
const methodOverride = require('method-override');
const ejsMate = require('ejs-mate');
const wrapAsync = require('./utils/wrapAsync');
const ExpressError = require('./utils/ExpressError');
const {listingSchema} = require("./schema")
const bcrypt = require("bcrypt");
const session = require("express-session");

const mongoURL = process.env.MONGO_URL;

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.engine("ejs", ejsMate);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(async (req, res, next) => {
    if (req.session.userId) {
        const user = await User.findById(req.session.userId);
        res.locals.currentUser = user;
    } else {
        res.locals.currentUser = null;
    }
    next();
});
app.use((req, res, next) => {
    res.locals.success = req.session.success;
    delete req.session.success;
    next();
});

// Home route
app.get("/", (req, res) => {
    res.render("listings/home.ejs");
});

const validateListing = (req, res, next) => {
  const {error} = listingSchema.validate(req.body);
    if(error){
      throw new ExpressError(400, error)
    }else{
      next();
    }
}

const isLoggedIn = (req, res, next) => {
    if (!req.session.userId) {
      req.session.returnTo = req.originalUrl;
      return res.redirect("/login");
    }
    next();
};

const isOwner = wrapAsync(async (req, res, next) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ExpressError(404, "Listing Not Found");
    }

    const listing = await Listing.findById(id);
    if (!listing) {
        throw new ExpressError(404, "Listing Not Found");
    }
    if (!listing.owner || !listing.owner.equals(req.session.userId)) {
        throw new ExpressError(403, "You don't have permission to modify this listing");
    }
    next();
});

const isHost = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect("/login");
    }

    if (res.locals.currentUser.role !== "host") {
        throw new ExpressError(
            403,
            "Only hosts can access this page"
        );
    }
    next();
};

const isAdmin = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect("/login");
    }
    if (res.locals.currentUser.role !== "admin") {
        throw new ExpressError(
            403,
            "Only admins can access this page"
        );
    }
    next();
};

const isReviewAuthor = wrapAsync(async (req, res, next) => {
    const { reviewId } = req.params;
    const review = await Review.findById(reviewId);
    if (!review) {
        throw new ExpressError(404, "Review Not Found");
    }
    if (!review.author.equals(req.session.userId)) {
        throw new ExpressError(
            403,
            "You don't have permission to modify this review"
        );
    }
    next();
});


// Index route
app.get("/listings", wrapAsync(async (req, res) => {

    const { q, country, sort } = req.query;

    let filter = {};

    // Search by title
    if (q) {
        filter.title = {
            $regex: q,
            $options: "i"
        };
    }

    // Filter by country
    if (country) {
        filter.country = country;
    }

    // Create MongoDB query
    let query = Listing.find(filter);

    // Sort by price
    if (sort === "price-asc") {
        query = query.sort({ price: 1 });
    }

    if (sort === "price-desc") {
        query = query.sort({ price: -1 });
    }

    const listings = await query;

    res.render("listings/index.ejs", {
        listings,
        q,
        country,
        sort
    });
}));

//New or Create route
app.get("/listings/new", isHost, (req, res) => {
    res.render("listings/new.ejs");
});

app.post("/listings", isHost,  validateListing, wrapAsync(async (req, res, next) => {
    const newListing = new Listing(req.body.listing);
    newListing.owner = req.session.userId;
    await newListing.save();
    res.redirect("/listings");
}));

// Edit route
app.get("/listings/:id/edit", isLoggedIn, isOwner, wrapAsync(async (req, res) => {

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ExpressError(404, "Listing Not Found");
    }

    const listing = await Listing.findById(id);
    if (!listing) {
        throw new ExpressError(404, "Listing Not Found");
    }
    res.render("listings/edit.ejs", { listing });
}));

// Update route
app.put("/listings/:id/update", isLoggedIn, isOwner, validateListing, wrapAsync(async (req, res) => {

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ExpressError(404, "Listing Not Found");
    }
    const listing = await Listing.findByIdAndUpdate(
        id,
        { ...req.body.listing },
        { new: true, runValidators: true }
    );
    if (!listing) {
        throw new ExpressError(404, "Listing Not Found");
    }
    res.redirect(`/listings/${listing._id}`);
}));

// Delete route
app.delete("/listings/:id/delete", isLoggedIn, isOwner, wrapAsync(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ExpressError(404, "Listing Not Found");
    }

    const existingBooking = await Booking.findOne({
        listing: id
    });

    if (existingBooking) {
        throw new ExpressError(
            400,
            "You cannot delete a listing with booking history"
        );
    }

    const deletedListing = await Listing.findByIdAndDelete(id);
    if (!deletedListing) {
        throw new ExpressError(404, "Listing Not Found");
    }
    await Review.deleteMany({ listing: id });
    res.redirect("/listings");
}));


// Show route for individual listing
app.get("/listings/:id", wrapAsync(async (req, res) => {

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ExpressError(404, "Listing Not Found");
    }

    const listing = await Listing.findById(id).populate("owner");
    const reviews = await Review.find({ listing: id }).populate("author");
    const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;
    const hasReviewed = req.session.userId
    ? reviews.some(review => review.author._id.equals(req.session.userId))
    : false;

    if (!listing) {
        throw new ExpressError(404, "Listing Not Found");
    }
    res.render("listings/show.ejs", { listing, reviews, hasReviewed, averageRating});
}));

// Booking routes
app.post("/listings/:id/bookings", isLoggedIn, wrapAsync(async (req, res) => {

    const { id } = req.params;
    const { checkIn, checkOut, guests } = req.body;
    
    const guestCount = Number(guests);
    if (!Number.isInteger(guestCount) || guestCount < 1) {
        throw new ExpressError(400, "Guests must be at least 1");
    }

    const listing = await Listing.findById(id);
    if (!listing) {
        throw new ExpressError(404, "Listing Not Found");
    }
    if (listing.owner && listing.owner.equals(req.session.userId)) {
    throw new ExpressError(
        400,
        "You cannot book your own listing"
    );
    }

    if (guestCount > listing.maxGuests) {
    throw new ExpressError(
        400,
        `This listing allows a maximum of ${listing.maxGuests} guests`
    );
    }

    const startDate = new Date(checkIn);
    const endDate = new Date(checkOut);
    if (endDate <= startDate) {
        throw new ExpressError(400, "Check-out must be after check-in");
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate < today) {
        throw new ExpressError(400, "Check-in date cannot be in the past");
    }

    const existingBooking = await Booking.findOne({
    listing: id,
    status: "confirmed",
    checkIn: { $lt: endDate },
    checkOut: { $gt: startDate }
    });

    if (existingBooking) {
        throw new ExpressError(
            400,
            "This listing is already booked for the selected dates"
        );
    }

    const numberOfNights =
        (endDate - startDate) / (1000 * 60 * 60 * 24);

    const totalPrice = numberOfNights * listing.price;
    const booking = new Booking({
        user: req.session.userId,
        listing: id,
        checkIn: startDate,
        checkOut: endDate,
        guests: guestCount,
        totalPrice
    });
    await booking.save();
    req.session.success = "Booking confirmed successfully!";
    res.redirect("/bookings");
}));

app.get("/listings/:id/availability", wrapAsync(async (req, res) => {
    const { id } = req.params;
    const { checkIn, checkOut } = req.query;

    const existingBooking = await Booking.findOne({
        listing: id,
        status: "confirmed",
        checkIn: { $lt: new Date(checkOut) },
        checkOut: { $gt: new Date(checkIn) }
    });

    res.json({
        available: !existingBooking
    });
}));

// Show Bookings to guest
app.get("/bookings", isLoggedIn, wrapAsync(async (req, res) => {
    const bookings = await Booking.find({
        user: req.session.userId
    }).populate("listing");

    res.render("bookings/index.ejs", { bookings });
}));

// Show Bookings to owner
app.get("/host/bookings",isHost, wrapAsync(async (req, res) => {

    const listings = await Listing.find({
        owner: req.session.userId
    });
    const listingIds = listings.map(listing => listing._id);

    const bookings = await Booking.find({
        listing: { $in: listingIds }
    }).populate("listing").populate("user");

    bookings.sort((a, b) => {
    if (a.status === b.status) {
        return a.checkIn - b.checkIn;
    }
    return a.status === "confirmed" ? -1 : 1;
    });
    res.render("bookings/host.ejs", { bookings });
}));

// Owner Listings
app.get("/host/listings", isHost, wrapAsync(async (req, res) => {
    const listings = await Listing.find({
        owner: req.session.userId
    });

    res.render("listings/host.ejs", { listings });
}));

// Become host
app.post("/become-host", isLoggedIn, wrapAsync(async (req, res) => {

    const user = await User.findById(req.session.userId);
    if (!user) {
        throw new ExpressError(404, "User Not Found");
    }
    if (user.role === "host") {
        throw new ExpressError(400, "You are already a host");
    }
    if (user.hostRequestStatus === "pending") {
        throw new ExpressError(400, "Your host request is already pending");
    }
    user.hostRequestStatus = "pending";
    await user.save();
    res.redirect("/listings");
}));


// Admin routes
app.get("/admin/host-requests", isAdmin, wrapAsync(async (req, res) => {
    const users = await User.find({
        hostRequestStatus: "pending"
    });
    res.render("admin/host-requests.ejs", { users });
}));

app.post("/admin/host-requests/:userId/approve", isAdmin, wrapAsync(async (req, res) => {

    const { userId } = req.params;

    const user = await User.findById(userId);

    if (!user) {
        throw new ExpressError(404, "User Not Found");
    }

    if (user.hostRequestStatus !== "pending") {
        throw new ExpressError(400, "No pending host request");
    }

    user.role = "host";
    user.hostRequestStatus = "none";

    await user.save();
    req.session.success = `${user.username} has been approved as a host.`;

    res.redirect("/admin/host-requests");
}));

app.post("/admin/host-requests/:userId/reject", isAdmin, wrapAsync(async (req, res) => {

    const { userId } = req.params;

    const user = await User.findById(userId);

    if (!user) {
        throw new ExpressError(404, "User Not Found");
    }

    if (user.hostRequestStatus !== "pending") {
        throw new ExpressError(400, "No pending host request");
    }

    user.hostRequestStatus = "rejected";

    await user.save();
    req.session.success = `${user.username}'s host request has been rejected.`;
    
    res.redirect("/admin/host-requests");
}));

// Cancel Booking
app.post("/bookings/:bookingId/cancel", isLoggedIn, wrapAsync(async (req, res) => {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
        throw new ExpressError(404, "Booking Not Found");
    }

    if (!booking.user.equals(req.session.userId)) {
        throw new ExpressError(
            403,
            "You don't have permission to cancel this booking"
        );
    }

    if (booking.status === "cancelled") {
        throw new ExpressError(400, "Booking is already cancelled");
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (booking.checkIn <= today) {
        throw new ExpressError(
            400,
            "You cannot cancel a booking after check-in"
        );
    }

    booking.status = "cancelled";
    await booking.save();

    res.redirect("/bookings");
}));

// Review routes
app.post("/listings/:id/reviews", isLoggedIn, wrapAsync(async (req, res) => {
    const { id } = req.params;

    const listing = await Listing.findById(id);
    if (!listing) {
        throw new ExpressError(404, "Listing Not Found");
    }

    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
        throw new ExpressError(400, "Rating must be between 1 and 5");
    }
    if (!comment || !comment.trim()) {
        throw new ExpressError(400, "Comment is required");
    }

    const existingReview = await Review.findOne({
    listing: id,
    author: req.session.userId
    });
    if (existingReview) {
        throw new ExpressError(400, "You have already reviewed this listing");
    }
    const review = new Review(req.body);
    review.author = req.session.userId;
    review.listing = id;
    await review.save();
    res.redirect(`/listings/${id}`);
}));

// review delete
app.delete("/listings/:id/reviews/:reviewId", isLoggedIn, isReviewAuthor,
    wrapAsync(async (req, res) => {
        const { id, reviewId } = req.params;
        await Review.findByIdAndDelete(reviewId);
        res.redirect(`/listings/${id}`);
    })
);

// Signup route
app.get("/signup", (req, res) => {
    res.render("users/signup.ejs");
});

app.post("/signup", wrapAsync(async (req, res) => {
    const { username, email, password} = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    try {
    await newUser.save();
        } catch (err) {
         if (err.code === 11000) {
         throw new ExpressError(400, "Username or email already exists");
        }
        throw err;
      }
    res.redirect("/login");
}));


// Login route
app.get("/login", (req, res) => {
    res.render("users/login.ejs");
});

app.post("/login", wrapAsync(async (req, res) => {

    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
        throw new ExpressError(401, "Invalid email or password");
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
        throw new ExpressError(401, "Invalid email or password");
    }
    req.session.userId = user._id;
    const redirectUrl = req.session.returnTo || "/listings";
    delete req.session.returnTo;
    res.redirect(redirectUrl);
}));


// Logout route
app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            throw new ExpressError(500, "Could not log out");
        }
        res.redirect("/listings");
    });
});


app.all('/{*splat}', (req, res, next) => {
    next(new ExpressError(404, 'Page Not Found'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  let { statusCode = 500, message = 'Something went wrong' } = err;
  console.error(err);
  res.status(statusCode).render("error.ejs", { err });
});


const port = process.env.PORT || 8080;
mongoose.connect(mongoURL)
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err);
  });