/**
 * Custom hook for managing token creation form state
 */

import { useState } from "react";
import { toast } from "sonner";
import { TokenCategory, TokenFormData } from "@/types/token";

const initialFormData: TokenFormData = {
  name: "",
  ticker: "",
  description: "",
  category: "meme",
  image: null,
  imagePreview: "",
  website: "",
  twitter: "",
  telegram: "",
  discord: "",
  otherLink: "",
  showSocialLinks: false,
};

export const useTokenForm = () => {
  const [formData, setFormData] = useState<TokenFormData>(initialFormData);

  const setTokenName = (name: string) => {
    setFormData((prev) => ({ ...prev, name }));
  };

  const setTicker = (ticker: string) => {
    setFormData((prev) => ({ ...prev, ticker: ticker.toUpperCase() }));
  };

  const setDescription = (description: string) => {
    setFormData((prev) => ({ ...prev, description }));
  };

  const setCategory = (category: TokenCategory) => {
    setFormData((prev) => ({ ...prev, category }));
  };

  const setWebsite = (website: string) => {
    setFormData((prev) => ({ ...prev, website }));
  };

  const setTwitter = (twitter: string) => {
    setFormData((prev) => ({ ...prev, twitter }));
  };

  const setTelegram = (telegram: string) => {
    setFormData((prev) => ({ ...prev, telegram }));
  };

  const setDiscord = (discord: string) => {
    setFormData((prev) => ({ ...prev, discord }));
  };

  const setOtherLink = (otherLink: string) => {
    setFormData((prev) => ({ ...prev, otherLink }));
  };

  const setShowSocialLinks = (show: boolean) => {
    setFormData((prev) => ({ ...prev, showSocialLinks: show }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFormData((prev) => ({ ...prev, image: file }));
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, imagePreview: reader.result as string }));
      };
      reader.readAsDataURL(file);
      toast.success("Image uploaded successfully!");
    }
  };

  const handleRemoveImage = () => {
    setFormData((prev) => ({ ...prev, image: null, imagePreview: "" }));
  };

  const handleReset = () => {
    setFormData(initialFormData);
    toast.success("Form reset!");
  };

  const clearSocialLinks = () => {
    setFormData((prev) => ({
      ...prev,
      showSocialLinks: false,
      website: "",
      twitter: "",
      telegram: "",
      discord: "",
      otherLink: "",
    }));
  };

  return {
    formData,
    setTokenName,
    setTicker,
    setDescription,
    setCategory,
    setWebsite,
    setTwitter,
    setTelegram,
    setDiscord,
    setOtherLink,
    setShowSocialLinks,
    handleImageChange,
    handleRemoveImage,
    handleReset,
    clearSocialLinks,
  };
};
