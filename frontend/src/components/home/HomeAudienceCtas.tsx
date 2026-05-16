import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import creatorBg from "@/assets/home/cta-creators-bg.png";
import recruiterBg from "@/assets/home/cta-recruiters-bg.png";
import creatorSoldier from "@/assets/home/cta-creator-soldier.png";
import recruiterSoldier from "@/assets/home/cta-recruiter-soldier.png";

const CREATE_DRAFT_PATH = "/create";

// Change this single constant if your Command Center route is named differently.
// The CTA is intentionally isolated so it does not touch CampaignGrid or draft logic.
const RECRUITER_SIGNUP_PATH = "/command-center/recruiter";

type AudienceCardProps = {
  tone: "creator" | "recruiter";
  title: string;
  kicker: string;
  body: string;
  buttonLabel: string;
  footer: string;
  bg: string;
  soldier: string;
  onClick: () => void;
};

function AudienceCard({
  tone,
  title,
  kicker,
  body,
  buttonLabel,
  footer,
  bg,
  soldier,
  onClick,
}: AudienceCardProps) {
  const isCreator = tone === "creator";

  return (
    <article
      className={cn(
        "relative isolate min-h-[255px] overflow-visible bg-cover bg-center",
        "px-6 py-6 sm:px-8 sm:py-7 lg:px-10",
        "flex items-center",
        "transition-transform duration-200 hover:-translate-y-0.5"
      )}
      style={{ backgroundImage: `url(${bg})` }}
    >
      <div
        className={cn(
          "relative z-20 max-w-[470px]",
          "pr-[115px] sm:pr-[190px] md:pr-[220px] xl:pr-[250px]"
        )}
      >
        <h2
          className={cn(
            "font-black uppercase leading-none tracking-[0.045em]",
            "text-[34px] sm:text-[42px] xl:text-[52px]",
            "text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.8)]"
          )}
        >
          {title}
        </h2>

        <p
          className={cn(
            "mt-3 text-[17px] sm:text-[19px] xl:text-[21px] font-extrabold leading-tight",
            isCreator ? "text-[#61ff25]" : "text-[#ff941f]"
          )}
        >
          {kicker}
        </p>

        <p className="mt-3 max-w-[410px] text-[15px] sm:text-[16px] xl:text-[18px] font-medium leading-snug text-white/86">
          {body}
        </p>

        <Button
          type="button"
          onClick={onClick}
          className={cn(
            "mt-5 h-11 min-w-[210px] rounded-none px-6",
            "border text-[13px] font-black uppercase tracking-[0.08em]",
            "shadow-[0_0_18px_rgba(0,0,0,0.55)]",
            isCreator
              ? "border-[#73ff2c]/70 bg-gradient-to-b from-[#29b800] to-[#126800] text-white hover:from-[#39d900] hover:to-[#168000]"
              : "border-[#ff9a22]/70 bg-gradient-to-b from-[#df750e] to-[#9b3d05] text-white hover:from-[#ff8b14] hover:to-[#b84907]"
          )}
        >
          <span>{buttonLabel}</span>
          <ChevronRight className="ml-4 h-4 w-4" />
        </Button>

        <div
          className={cn(
            "mt-4 text-center text-[12px] sm:text-[13px] font-black uppercase tracking-[0.28em]",
            isCreator ? "text-[#4df313]" : "text-[#ff9a22]"
          )}
        >
          {footer}
        </div>
      </div>

      <img
        src={soldier}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn(
          "pointer-events-none absolute z-10 select-none object-contain",
          "bottom-0",
          isCreator
            ? "right-[2%] h-[118%] max-h-[330px] sm:right-[4%] xl:right-[6%]"
            : "right-[-1%] h-[126%] max-h-[350px] sm:right-[1%] xl:right-[3%]",
          "max-w-[48%] sm:max-w-[46%] md:max-w-[50%]"
        )}
      />
    </article>
  );
}

export function HomeAudienceCtas() {
  const navigate = useNavigate();

  return (
    <section
      className={cn(
        "relative z-20 grid grid-cols-1 gap-4 overflow-visible",
        "lg:grid-cols-2"
      )}
      aria-label="Creator and recruiter onboarding"
    >
      <AudienceCard
        tone="creator"
        title="For Creators"
        kicker="Launch your campaign. Build your army."
        body="Create draft memecoins, tell your story, build your community, and prepare your coin for battle inside MemeWarzone."
        buttonLabel="Create a Draft"
        footer="Launch • Build • Deploy"
        bg={creatorBg}
        soldier={creatorSoldier}
        onClick={() => navigate(CREATE_DRAFT_PATH)}
      />

      <AudienceCard
        tone="recruiter"
        title="For Recruiters"
        kicker="We’re looking for YOU."
        body="Recruit your Squad, bring in coin creators and traders, and become the force that drives visibility, traction, and community growth."
        buttonLabel="Join as Recruiter"
        footer="Scout • Recruit • Earn"
        bg={recruiterBg}
        soldier={recruiterSoldier}
        onClick={() => navigate(RECRUITER_SIGNUP_PATH)}
      />
    </section>
  );
}