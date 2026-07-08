import { recruiterAuthNonce } from "./dev-fix/recruiter-portal.js";

export default function handler(req, res) {
  return recruiterAuthNonce(req, res);
}
