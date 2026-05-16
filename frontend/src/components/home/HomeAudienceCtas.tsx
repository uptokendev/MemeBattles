import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWallet } from "@/contexts/WalletContext";
import creatorBg from "@/assets/home/cta-creators-bg.png";
import recruiterBg from "@/assets/home/cta-recruiters-bg.png";
import creatorSoldier from "@/assets/home/cta-creator-soldier.png";
import recruiterSoldier from "@/assets/home/cta-recruiter-soldier.png";

const CREATE_DRAFT_PATH = "/create";

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
        "relative isolate w-full overflow-visible",
        "h-[245px] sm:h-[265px] lg:h-[285px] 2xl:h-[300px]",
        "bg-transparent border-0 shadow-none"
      )}
    >
      {/* Background art: stretched to fully fill the card */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-transparent">
        <img
          src={bg}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-full w-full select-none object-fill"
        />
      </div>

      {/* Text block */}
<div
  className={cn(
    "absolute z-30",
    "top-[8%] sm:top-[9%] lg:top-[10%] 2xl:top-[8%]",
    isCreator
      ? "left-[7%] w-[74%] sm:left-[8%] sm:w-[66%] lg:left-[12%] lg:w-[42%]"
      : "left-[7%] w-[74%] sm:left-[8%] sm:w-[66%] lg:left-[12%] lg:w-[42%]"
  )}
>
        <h2
          className={cn(
            "font-black uppercase leading-[0.95] tracking-[0.045em]",
            "text-[26px] sm:text-[29px] md:text-[31px] 2xl:text-[34px]",
            "whitespace-nowrap text-white",
            "drop-shadow-[0_3px_10px_rgba(0,0,0,0.9)]"
          )}
        >
          {title}
        </h2>

        <p
          className={cn(
            "mt-3 max-w-[430px]",
            "text-[13px] sm:text-[15px] md:text-[16px] 2xl:text-[18px]",
            "font-extrabold leading-[1.12]",
            isCreator ? "text-[#5cff22]" : "text-[#ff981f]"
          )}
        >
          {kicker}
        </p>

        <p
          className={cn(
            "mt-3 max-w-[430px]",
            "text-[11px] sm:text-[12px] md:text-[13px] 2xl:text-[14px]",
            "font-semibold leading-[1.32]",
            "text-white/88 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]"
          )}
        >
          {body}
        </p>

        <Button
          type="button"
          onClick={onClick}
          style={{
            clipPath:
              "polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)",
          }}
          className={cn(
            "mt-4 md:mt-5",
            "h-[38px] sm:h-[40px] md:h-[42px] 2xl:h-[44px]",
            "min-w-[210px] sm:min-w-[245px] md:min-w-[270px] 2xl:min-w-[285px]",
            "rounded-none px-5 md:px-7",
            "border text-[10px] sm:text-[11px] md:text-[12px] 2xl:text-[13px]",
            "font-black uppercase tracking-[0.08em]",
            "shadow-[0_0_18px_rgba(0,0,0,0.7)]",
            "flex items-center justify-center gap-4",
            isCreator
              ? "border-[#75ff2d]/75 bg-gradient-to-b from-[#24bd00] to-[#126900] text-white hover:from-[#35d900] hover:to-[#168000]"
              : "border-[#ff9a22]/75 bg-gradient-to-b from-[#df780d] to-[#9b3e05] text-white hover:from-[#ff8d15] hover:to-[#b84907]"
          )}
        >
          <span>{buttonLabel}</span>
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div
          className={cn(
            "mt-3 md:mt-4",
            "w-[210px] sm:w-[245px] md:w-[270px] 2xl:w-[285px]",
            "text-center whitespace-nowrap",
            "text-[9px] sm:text-[10px] md:text-[11px] 2xl:text-[12px]",
            "font-black uppercase tracking-[0.32em]",
            isCreator ? "text-[#4df313]" : "text-[#ff9a22]"
          )}
        >
          {footer}
        </div>
      </div>

      {/* Soldier art: smaller, shifted right, bottom-aligned */}
<img
  src={soldier}
  alt=""
  aria-hidden="true"
  draggable={false}
  className={cn(
    "pointer-events-none absolute bottom-0 z-20 select-none object-contain max-w-none",
    isCreator
      ? [
          // Mobile/tablet only: compensate for transparent PNG canvas and push visible soldier right
          "right-[-30%] h-[94%]",
          "sm:right-[-22%] sm:h-[100%]",
          // Desktop unchanged
          "lg:right-[-6%] lg:h-[108%]",
          "2xl:right-[-5%] 2xl:h-[110%]",
        ].join(" ")
      : [
          // Mobile/tablet only: compensate for transparent PNG canvas and push visible soldier right
          "right-[-32%] h-[98%]",
          "sm:right-[-24%] sm:h-[104%]",
          // Desktop unchanged
          "lg:right-[-11%] lg:h-[114%]",
          "2xl:right-[-9%] 2xl:h-[116%]",
        ].join(" ")
  )}
/>
    </article>
  );
}

export function HomeAudienceCtas() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const [pendingRecruiterRedirect, setPendingRecruiterRedirect] = useState(false);

  const recruiterPath = wallet.account
    ? `/profile/${wallet.account.toLowerCase()}/command/recruiter`
    : "";

  useEffect(() => {
    if (!pendingRecruiterRedirect || !wallet.account) return;

    setPendingRecruiterRedirect(false);
    navigate(`/profile/${wallet.account.toLowerCase()}/command/recruiter`);
  }, [pendingRecruiterRedirect, wallet.account, navigate]);

  const handleRecruiterClick = async () => {
    if (wallet.account) {
      navigate(recruiterPath);
      return;
    }

    setPendingRecruiterRedirect(true);

    try {
      await wallet.connect();
    } catch {
      setPendingRecruiterRedirect(false);
    }
  };

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
        onClick={handleRecruiterClick}
      />
    </section>
  );
}