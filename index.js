var express = require('express');
var passport = require('passport');
var Strategy = require('passport-google-oauth20').Strategy;
var JwtStrategy = require('passport-jwt').Strategy
var jwt = require('jsonwebtoken');

var config = require('./config');

// Configure the Google strategy for use by Passport.
//
// OAuth 2.0-based strategies require a `verify` function which receives the
// credential (`accessToken`) for accessing the Google API on the user's
// behalf, along with the user's profile.  The function must invoke `cb`
// with a user object, which will be set at `req.user` in route handlers after
// authentication.
passport.use(new Strategy({
    clientID: config.google_auth.clientID,
    clientSecret: config.google_auth.clientSecret,
    callbackURL: config.google_auth.returnURL
  },
  function(accessToken, refreshToken, profile, cb) {
    // Look up the user info in the database and return that
    //console.log(profile);
    User.findOne({ google_id: profile.id }).populate('friends').exec(function(err, user) {
      if (!user) {
        user = new User({ displayName: profile.displayName, google_id: profile.id, photos: profile.photos });
        user.save(function(err) {
          return cb(err, user);
        });
      } else {
        return cb(err, user);
      }
    });
  }));

// Configure the JWT strategy for passport, for after we've authenticated with Google
var opts = {
  jwtFromRequest: function(req) {
    var token = null;
    if (req && req.cookies)
    {
        token = req.cookies['jwt'];
    }
    return token;
  },
  secretOrKey: config.jwtSecret
};
passport.use(new JwtStrategy(opts, function(jwt_payload, done) {
  done(null, jwt_payload);
}));


// Create a new Express application.
var app = express();

// Configure view engine to render EJS templates.
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

// Use application-level middleware for common functionality, including logging, parsing.
app.use(require('morgan')('combined'));
app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({ extended: true }));

app.use(passport.initialize());

// Define routes.
app.get('/',
  function(req, res) {
    res.render('index', {});
  });

app.get('/login',
  function(req, res){
    res.render('login');
  });

app.get('/login/google',
  passport.authenticate('google', { scope: ['profile'], session: false }));

app.get('/login/google/return', 
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  function(req, res) {
    var token = jwt.sign({ displayName: req.user.displayName, google_id: req.user.google_id, _id: req.user._id }, opts.secretOrKey, {
      expiresIn: 604800 // 1 week in seconds
    });
    res.cookie('jwt', token, { maxAge: 604800000, httpOnly: true });
    res.redirect('/home');
  });

app.get('/home',
  passport.authenticate('jwt', { session: false, failureRedirect: '/login/google' }),
  function(req, res) {
    if (req.user) {
      User.findOne({ _id: req.user._id }).populate('friends').exec(function(err, user) {
        res.render('home', { user: user });
      });
    } else {
      res.render('home', { user: req.user });
    }
  });

app.post('/gifts',
  passport.authenticate('jwt', { session: false, failureRedirect: '/login/google' }),
  function(req, res){
    var gift = new Gift({ description: req.body.description, url: req.body.url, completed: false });
    var user = User.findOne({ _id: req.user._id }, function(err, user) {
      if (err)
        return next(err);
      if (!user)
        return res.status(500).send({status:500, message: 'No such user', type:'internal'});
      user.gifts.push(gift);
      user.save(function(err) {
        if (err)
          return next(err);
        res.redirect('/home');
      });
    });
  });

app.post('/friends',
  passport.authenticate('jwt', { session: false, failureRedirect: '/login/google' }),
  function(req, res){
    // don't allow adding yourself as a friend
    if (req.body.google_id == req.user.google_id) {
      return res.status(500).send({status:500, message: 'You can\'t add yourself as a friend', type:'internal'});
    }
    User.findOne({ google_id: req.body.google_id }, function(err, friend) {
      if (err)
        return res.send(err);
      if (!friend)
        return res.status(500).send({status:500, message: 'No such friend', type:'internal'});
      User.findOne({ _id: req.user._id }, function(err, user) {
        if (err)
          return res.send(err);
        if (!user)
          return res.status(500).send({status:500, message: 'No such user', type:'internal'});
        user.friends.push(friend);
        user.save(function(err) {
          if (err)
            return next(err);
          res.redirect('/home');
        });
      });
    });
  });

app.get('/friends/:google_id', 
  passport.authenticate('jwt', { session: false, failureRedirect: '/login/google' }),
  function(req, res){
    User.findOne({ google_id: req.params.google_id }, function(err, user) {
      if (err)
        return res.send(err);
      if (!user)
        return res.status(500).send({status:500, message: 'No such user', type:'internal'});
      res.render('friend', { friend: user });
    });
  });

// this is a "post" because html doesn't let you do "put"s. This endpoint just updates the gift 
// to be claimed by whoever is logged in.
app.post('/friends/:friend_id/gifts/:gift_id',
  passport.authenticate('jwt', { session: false, failureRedirect: '/login/google' }),
  function(req, res){
    User.findOne({ google_id: req.params.friend_id }, function(err, user) {
      if (err)
        return next(err);
      if (!user)
        return res.status(500).send({status:500, message: 'No such user', type:'internal'});
      var gift = user.gifts.id(req.params.gift_id);
      gift.completed = true;
      gift.completedBy = req.user._id;
      gift.completedDate = new Date();
      user.save(function(err) {
        if (err)
          return next(err);
        res.redirect('/friends/'+req.params.friend_id);
      });
    });
  });

// set up database
var mongoose = require('mongoose');
mongoose.connect(config.mongodb.connectionstring);

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  // we're connected!
  console.log('Connected to database');
});

var giftSchema = mongoose.Schema({
  description: String,
  url: String,
  completed: Boolean,
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedDate: Date
},{ timestamps: true });
var Gift = mongoose.model('Gift', giftSchema);

var userSchema = mongoose.Schema({
  displayName: String,
  google_id: { type: String, index: true },
  photos: [mongoose.Schema.Types.Mixed],
  gifts: [giftSchema],
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
},{ timestamps: true });
var User = mongoose.model('User', userSchema);

app.listen(config.web.port);
