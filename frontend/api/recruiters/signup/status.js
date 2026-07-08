import { recruiterSignupStatus } from "../../dev-fix/attribution.js";

export default function handler(req, res) {
  return recruiterSignupStatus(req, res);
}
