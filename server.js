require("dotenv").config();
const express = require("express");
const app = express();
const PORT = process.env.PORT || 8000;
const mongoose = require("mongoose");
const expressLayout = require("express-ejs-layouts");
const path = require("path");
const Product = require("./app/models/product");
const User = require("./app/models/user");
const flash = require("express-flash");
const bcrypt = require("bcrypt");
const session = require("express-session");
const MongoDbStore = require("connect-mongo")(session);
const passport = require("passport");
const guest = require("./app/middleware/guest");
const Order = require("./app/models/order");
const Address = require("./app/models/address");
const auth = require("./app/middleware/auth");
const admin = require("./app/middleware/admin");
const Emitter = require("events");




mongoose.connect(process.env.MONGO_CONNECTION_URL , {
    useNewUrlParser:true,
    useCreateIndex:true,
    useUnifiedTopology:true,
    useFindAndModify:true
}).then(()=> {
    console.log("Successful connection");
}).catch(()=> {
    console.log("Connection failed");
})


const mongoStore = new MongoDbStore({
    mongooseConnection: mongoose.connection,
    collection: 'sessions'
})

//Event emitter
const eventEmitter = new Emitter();
//har jagah access ke liye
app.set('eventEmitter' , eventEmitter);


//session config 
//session act as middleware so we use app.use
app.use(session({
    //cookies ko encrypt karne ke liye 
    secret: process.env.COOKIE_SECRET,
    resave :false,
    //by defalt memory sessions kaha store kare
    store : mongoStore,
    saveUninitialized:false,
    cookie :  { maxAge: 1000*24*60*60 } //24 hrs
}))

//passport config 
require("./app/config/passport")(passport);
app.use(passport.initialize());
app.use(passport.session());



app.use(flash());
app.use(expressLayout);
app.set("views" , path.join(__dirname , "/resources/views"));
app.set("view engine" , "ejs");
app.use(express.static(path.join(__dirname , "./public")))
app.use(express.json()); //for requesting json data
app.use(express.urlencoded({extended : false})) //for requesting array string obejcts 

//as session is not defined in all pages so we define global middleware
app.use((req,res,next)=> {
    res.locals.session = req.session;
    res.locals.user = req.user;
    next();
})

app.get("/" , async(req,res)=> {
    const products = await Product.find();
    res.render("home" , {products : products});
});

app.get("/addproduct" , (req,res)=> {
    res.render("addproduct");
})

app.post("/addproduct" ,async (req,res)=> {
    const newProduct = new Product({
        title : req.body.title,
        price: req.body.price,
        rating : req.body.rating,
        image : req.body.image,
    });
    await newProduct.save();
    res.send("data send")
})



app.get("/login" ,guest, (req,res)=> {
    res.render("auth/login");
})

const generateRedirectUrl = (req)=> {
    return req.user.role === 'admin' ? '/admin/orders' : '/'
}

app.post("/login" , (req,res,next)=> {
    const {email , password} = req.body;
    if(!email || !password) {
        req.flash("error" , 'All fiels are required');
        return res.redirect("/login");
    }
    passport.authenticate('local' , (err , user , info)=> {
        if(err) {
            req.flash('error' , info.message);
            next(err)
        } 
        if(!user) {
            req.flash('error' , info.message);
            return res.redirect("/login");
        }
        req.logIn(user ,(err)=> {
            if(err) {
                req.flash('error' , info.message);
                next(err);
            }
            return res.redirect(generateRedirectUrl(req))
        })
    })(req,res,next)
})

app.get("/createaccount" ,guest,(req,res)=> {
    res.render("auth/createaccount");
})

app.post("/createaccount", async(req,res)=> {
    const {name , email ,password} = req.body;

    if(!name || !email || !password) {
        req.flash('error' , 'All fields are required');
        req.flash('name' , name);
        req.flash('email', email);
        return res.redirect("/createaccount");
    }

     //check if email exits 
     User.exists({email : email }, (err,result)=>{
        if(result) {
            req.flash('error' , 'Email already taken');
            req.flash('name', name);
            req.flash('email', email);
            return res.redirect('/createaccount')
        }
    })

    const hashPassword = await bcrypt.hash(password , 10);

    const newUser = new User({
        name : req.body.name,
        email: req.body.email,
        password : hashPassword
    })
    await newUser.save().then((user)=> {
        return res.redirect("/");
    }).catch((e)=> {
        req.flash("error" , "Something went wrong");
        return res.redirect("/createaccount")
    });
})

app.post("/logout" , (req,res)=> {
    req.logout();
    res.redirect("/");
})

app.get("/cart" , (req,res)=> {
    res.render("cart");
})

app.post("/update-cart" , (req,res)=> {
    if(!req.session.cart) {
        req.session.cart = {
            items: {},
            totalQty: 0,
            totalPrice: 0
        }
    }
    let cart = req.session.cart
        //check if item doesnot exist in cart
        if(!cart.items[req.body._id]) {
           cart.items[req.body._id] = {
               item :req.body,
               qty: 1
           }
           cart.totalQty = cart.totalQty +1
           cart.totalPrice = cart.totalPrice + req.body.price
        } else {
            cart.items[req.body._id].qty += 1;
            cart.totalQty = cart.totalQty +1
            cart.totalPrice = cart.totalPrice + req.body.price 
        }
    res.json({totalQty : req.session.cart.totalQty})
})

// app.post("/rm-cart" , (req,res)=> {
//     let cart = req.session.cart;
//     console.log(cart);
//     req.body.qty -= 1;
//     cart.items[req.body.item._id].qty -=1;
//     cart.totalQty = cart.totalQty-1;
//     cart.totalPrice = cart.totalPrice - req.body.price;
//     res.json({totalQty : req.session.cart.totalQty})
// })

app.get("/checkout",auth , async(req,res)=> {
    const address = await Address.find({customerId: req.user._id})   
    res.render("checkout" , {addresses : address});
})

app.post("/orders" , (req,res)=> {
    const {addgift} = req.body;
    res.redirect("/checkout");
})


app.post("/address" , (req,res) => {
    const {phone , pincode , address} = req.body;
    const addressA = new Address({
        customerId : req.user._id,
        phone: phone,
        pincode : pincode,
        address : address,
    })
    addressA.save().then(()=> {
        req.flash("success" , "Address saved");
        res.redirect("/checkout");
    }).catch((e)=> {
        req.flash("error" , "Something went wrong");
        res.redirect("/");
    })
})

app.post("/changeaddress" , async(req,res)=> {
    await Address.deleteOne({customerId: req.user._id})
    res.redirect("/checkout");
})

app.post("/placeanorder" , (req,res)=> {
    const orders = new Order ({
        customerId : req.user._id,
        items : req.session.cart.items
    })
    orders.save().then((result)=> {
        Order.populate(result , {path : 'customerId'} , (err , placedOrder)=> {
            delete req.session.cart;
            eventEmitter.emit("orderPlaced" , result)
            return res.status(200).redirect("/")
        })
    }).catch((e)=> {
        req.flash("error" , "Something went wrong");
        return res.status(404).redirect("/cart");
    })
})

app.get("/admin/orders" ,admin, (req,res)=> {
    Order.find({status : { $ne : 'completed'}} , null , {sort : {'createdAt' : -1}} )
    .populate('customerId' , '-password').exec((err , orders)=> {
        //check if there is any ajax call or not
        if(req.xhr) {
            return res.json(orders)
        }
        return res.render("admin/orders");
    })
})

app.post("/admin/order/status" , admin , (req,res)=> {
    Order.updateOne({_id : req.body.orderId} , {status : req.body.status} , (err , data)=> {
        eventEmitter.emit('orderUpdated' , {id : req.body.orderId , status : req.body.status})
        res.redirect("/admin/orders");
    })
})

app.get("/orders/:id" ,auth, async(req,res)=> {
    const order = await Order.findById(req.params.id);
    if(req.user._id.toString() === order.customerId.toString()) {
        res.render("singleOrder" , {order : order});
    }else {
        res.redirect("/");
    }
})

app.get('/allorders', auth ,async(req,res)=> {
    const orders = await Order.find({customerId : req.user._id});
    res.render("allorders" , {orders:orders});
})


app.use((req,res)=> {
    res.status(404).render("errors")
})

const server = app.listen(PORT , (e)=> {
    console.log(`Listening on port ${PORT}`);
})

const io = require("socket.io")(server);

io.on('connection' , (socket) => {
    socket.on('join' , (roomName)=> {
        socket.join(roomName);
    })
})

eventEmitter.on('orderUpdated', (data)=> {
    io.to(`order_${data.id}`).emit('orderUpdated' ,data);
})

eventEmitter.on('orderPlaced' , (data)=> {
    io.to('adminRoom').emit('orderPlaced' , data)
})