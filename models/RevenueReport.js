const mongoose = require('mongoose');

const revenueReportSchema = new mongoose.Schema({
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    year: {
        type: Number,
        required: true
    },
    totalContracts: {
        type: Number,
        default: 0
    },
    totalRevenue: {
        type: Number,
        default: 0
    },
    netSales: {
        type: Number,
        default: 0
    },
    pendingAmounts: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Create a compound index to ensure unique reports per month/year
revenueReportSchema.index({ month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('RevenueReport', revenueReportSchema);
