const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  // Customer Details
  companyName: { type: String, required: true },
  address: String,
  contactPerson: String,
  pinCode: String,
  mailAddress: String,
  contactNo: String,
  gstNo: String,
  profileImage: String, // store image URL or base64
  date: String,

  // Project Details
  websiteSubscription: String,
  noOfPages: String,
  domainName: String,
  seo: String,
  noOfKeywords: String,
  additionalPlans: {
    SEO: Boolean,
    smo: Boolean,
    smm: Boolean,
    youtube: Boolean,
    ads: Boolean,
    mobileApp: Boolean,
    dynamicWebsite: Boolean,
    emailMarketing: Boolean,
    ecommerce: Boolean,
  },

  // Payment Details
  actualAmount: String,
  gst: String,
  amountReceived: String,
  paymentThrough: String,
  balanceAmount: String,
  amountInRupees: String,
  bankName: String,
  chequeDate: String,
  chequeNo: String,

  // Signatures
  customerSignature: String, // store image URL or base64
  executiveSignature: String, // store image URL or base64
}, { timestamps: true });

module.exports = mongoose.model('Lead', leadSchema); 