import { recruiterSignupCodeAvailability } from "../../dev-fix/attribution.js";

export default function handler(req, res) {
  return recruiterSignupCodeAvailability(req, res);
}
