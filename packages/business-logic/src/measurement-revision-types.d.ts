import type { UUID } from "@minarvabiz/types";

declare module "@minarvabiz/types" {
  interface MeasurementProfile {
    /** Sequential revision number; legacy profiles default to 1 at read time. */
    version?: number;
    /** Link to the immediately previous measurement profile revision. */
    previousProfileId?: UUID | null;
  }
}
