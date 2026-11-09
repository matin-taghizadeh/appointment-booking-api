import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true },
    // Every grid slot this booking occupies. Used by the unique index below.
    slots: { type: [Date], required: true },
    status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed' },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    cancelledAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.slots;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/**
 * Double-booking protection enforced by the database itself.
 * Two confirmed bookings can never share a slot, even if two requests arrive at
 * the same millisecond. Cancelled bookings drop out of the index (partial filter),
 * which frees their slots automatically.
 */
bookingSchema.index({ slots: 1 }, { unique: true, partialFilterExpression: { status: 'confirmed' } });

export const Booking = mongoose.model('Booking', bookingSchema);
