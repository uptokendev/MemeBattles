import { recruiterPortal } from "./dev-fix/recruiter-portal.js";

export default function handler(req, res) {
  return recruiterPortal(req, res);
}
