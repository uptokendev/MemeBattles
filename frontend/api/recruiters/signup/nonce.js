import { recruiterSignupNonce } from "../../dev-fix/attribution.js";

export default function handler(req, res) {
  return recruiterSignupNonce(req, res);
}
