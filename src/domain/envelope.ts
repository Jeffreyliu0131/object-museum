import {
  CurrentExhibitEnvelopeSchema,
  ExhibitRecordSchema,
  type CurrentExhibitEnvelope,
  type ExhibitRecord,
} from "./types";

export function localMediaRefs(record: ExhibitRecord): string[] {
  return [record.image, record.audio]
    .filter(
      (media): media is NonNullable<typeof media> =>
        media !== null && media.storage === "local",
    )
    .map((media) => media.id);
}

export function createInitialEnvelope(input: {
  recordId: string;
  record: ExhibitRecord;
}): CurrentExhibitEnvelope {
  const record = ExhibitRecordSchema.parse(input.record);
  return CurrentExhibitEnvelopeSchema.parse({
    schemaVersion: 1,
    recordId: input.recordId,
    revision: 1,
    record,
    mediaRefs: localMediaRefs(record),
  });
}

export function reviseEnvelope(
  current: CurrentExhibitEnvelope,
  record: ExhibitRecord,
): CurrentExhibitEnvelope {
  const parsedRecord = ExhibitRecordSchema.parse(record);
  return CurrentExhibitEnvelopeSchema.parse({
    schemaVersion: 1,
    recordId: current.recordId,
    revision: current.revision + 1,
    record: parsedRecord,
    mediaRefs: localMediaRefs(parsedRecord),
  });
}
