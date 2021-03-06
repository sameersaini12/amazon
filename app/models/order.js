const mongoose = require('mongoose');

const orderSchema = mongoose.Schema({
    customerId : {
        type: mongoose.Schema.Types.ObjectId,
        ref : 'User',
        required: true
    },
    items : {type : Object , required : true},
    addgift : {type: Boolean , default: false},
    payment: {type:String , default: "Cash-on-delivery" },
    status : {type : String , default : "order-placed"}
},{timestamps : true})

const Order = mongoose.model("Order" , orderSchema);

module.exports = Order;