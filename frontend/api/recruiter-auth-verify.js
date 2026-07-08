import { recruiterAuthVerify } from "./dev-fix/recruiter-portal.js";

export default function handler(req, res) {
  return recruiterAuthVerify(req, res);
}
