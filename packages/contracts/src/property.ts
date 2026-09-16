import { z } from 'zod';
import {
  entityIdSchema,
  nonEmptyTextSchema,
  recordMetaSchema,
} from './common.js';

export const propertyTypeSchema = z.enum([
  'paying_guest',
  'hostel',
  'coaching_institute',
]);
export const addressSchema = z.strictObject({
  line1: nonEmptyTextSchema.max(160),
  line2: z.string().trim().max(160).optional(),
  locality: nonEmptyTextSchema.max(100),
  city: nonEmptyTextSchema.max(100),
  state: nonEmptyTextSchema.max(100),
  postalCode: z.string().regex(/^\d{6}$/),
  countryCode: z.literal('IN'),
});
export const geoPointSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export const propertySchema = z
  .strictObject({
    id: entityIdSchema,
    name: nonEmptyTextSchema.max(160),
    type: propertyTypeSchema,
    address: addressSchema,
    location: geoPointSchema,
    dataMode: z.literal('demo'),
    profileStatus: z.enum(['draft', 'published', 'archived']),
  })
  .and(recordMetaSchema);
export const buildingSchema = z
  .strictObject({
    id: entityIdSchema,
    propertyId: entityIdSchema,
    name: nonEmptyTextSchema.max(120),
    externalReference: z.string().trim().max(120).optional(),
    identityStatus: z.enum(['unconfirmed', 'reviewed']),
  })
  .and(recordMetaSchema);
export const areaKindSchema = z.enum([
  'entrance',
  'staircase',
  'corridor',
  'classroom',
  'room',
  'washroom',
  'kitchen',
  'basement',
  'terrace',
  'utility',
  'other',
]);
export const floorAreaSchema = z
  .strictObject({
    id: entityIdSchema,
    buildingId: entityIdSchema,
    floorLabel: nonEmptyTextSchema.max(40),
    floorOrder: z.number().int().min(-20).max(300),
    areaLabel: nonEmptyTextSchema.max(80),
    areaKind: areaKindSchema,
    publicLabel: nonEmptyTextSchema.max(120),
    isPrivateRoom: z.boolean(),
  })
  .and(recordMetaSchema)
  .superRefine((value, context) => {
    if (value.isPrivateRoom && /(?:room\s*)?\d{2,}/i.test(value.publicLabel)) {
      context.addIssue({
        code: 'custom',
        message:
          'Public labels for private rooms must not contain a room number',
        path: ['publicLabel'],
      });
    }
  });

export type Property = z.infer<typeof propertySchema>;
export type Building = z.infer<typeof buildingSchema>;
export type FloorArea = z.infer<typeof floorAreaSchema>;
