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
  post: String, // Added missing post field (radio)
  noOfPosts: String, // Added missing noOfPosts field
  additionalPlans: {
    aso: Boolean, // Renamed from SEO to match frontend
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
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Added for bulk assignment
}, { timestamps: true });

// Performance Indexes
leadSchema.index({ companyName: 1 });
leadSchema.index({ contactNo: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ companyName: 'text', contactPerson: 'text', mailAddress: 'text' });

module.exports = mongoose.model('Lead', leadSchema);