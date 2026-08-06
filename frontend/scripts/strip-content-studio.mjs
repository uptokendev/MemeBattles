import fs from "fs";

const path = "frontend/api/server.mjs";
let c = fs.readFileSync(path, "utf8");

c = c.replace(/import \{ contentAiGenerateVariants \} from "\.\/content-ai\.js";\r?\n/, "");
c = c.replace(
  /import \{\r?\n(?:  contentPlanner[^\n]+\r?\n)+\} from "\.\/content-planner\.js";\r?\n/,
  "",
);

const routePatterns = [
  /router\.all\("\/content-ai\/generate-variants", wrap\(contentAiGenerateVariants\)\);\r?\n/,
  /router\.all\("\/posts", wrap\(contentPlannerPosts\)\);\r?\n/,
  /router\.all\("\/posts\/:id\/variants", wrap\(contentPlannerPostVariants\)\);\r?\n/,
  /router\.all\("\/posts\/:id", wrap\(contentPlannerPostById\)\);\r?\n/,
  /router\.all\("\/variants\/:variantId\/schedule", wrap\(contentPlannerVariantSchedule\)\);\r?\n/,
  /router\.all\("\/variants\/:id", wrap\(contentPlannerVariantById\)\);\r?\n/,
  /router\.all\("\/calendar", wrap\(contentPlannerCalendar\)\);\r?\n/,
  /router\.all\("\/schedules\/:id", wrap\(contentPlannerSchedulesById\)\);\r?\n/,
  /router\.all\("\/content-campaigns\/:id", wrap\(contentPlannerCampaignById\)\);\r?\n/,
  /router\.all\("\/content-campaigns", wrap\(contentPlannerCampaigns\)\);\r?\n/,
  /router\.all\("\/content-tags", wrap\(contentPlannerTags\)\);\r?\n/,
];

for (const re of routePatterns) c = c.replace(re, "");

fs.writeFileSync(path, c);
const leftover = c.match(/content-ai|contentPlanner|content-planner/g) || [];
console.log("leftover refs:", leftover.length);
if (leftover.length) {
  console.error(leftover);
  process.exit(1);
}
console.log("ok");
