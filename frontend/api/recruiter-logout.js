import { recruiterLogout } from "./dev-fix/recruiter-portal.js";

export default function handler(req, res) {
  return recruiterLogout(req, res);
}
