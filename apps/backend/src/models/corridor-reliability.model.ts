import mongoose, { Schema, Document } from 'mongoose';

export interface ICorridorReliability extends Document {
  timeWindow: string; // AM_PEAK, PM_PEAK, OFF_PEAK
  sourcePeriod: string; // WEEKLY, MONTHLY
  corridorKey: string | null; // null means all corridors
  periodStart: string;
  periodEnd: string;
  data: any[]; // The list of reliability records
  updatedAt: Date;
}

const CorridorReliabilitySchema: Schema = new Schema(
  {
    timeWindow: { type: String, required: true, index: true },
    sourcePeriod: { type: String, required: true, index: true },
    corridorKey: { type: String, default: null, index: true },
    periodStart: { type: String, required: true },
    periodEnd: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  {
    timestamps: true,
    collection: 'corridor-reliability-cache',
  }
);

// Index for lookup
CorridorReliabilitySchema.index({ timeWindow: 1, sourcePeriod: 1, corridorKey: 1 }, { unique: true });

export const CorridorReliability = mongoose.model<ICorridorReliability>(
  'CorridorReliability',
  CorridorReliabilitySchema
);
