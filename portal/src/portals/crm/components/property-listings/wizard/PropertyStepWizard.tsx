"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2, Home } from "lucide-react";
import { toast } from "sonner";
import { CrmPageHeader } from "@/components/crm/ui";
import {
  Step1LandDetails,
  INITIAL_PROPERTY_WIZARD_DRAFT,
  type PropertyListingWizardDraft,
} from "./Step1LandDetails";
import { Step2UploadImages } from "./Step2UploadImages";
import { Step3ContactDetails } from "./Step3ContactDetails";
import { Step4MapLocation } from "./Step4MapLocation";
import { Step5ReviewSubmit } from "./Step5ReviewSubmit";
import { createBackendPropertyListing } from "@/lib/crm/property-listings/backend-api";
import api from "@/lib/crm/api";

const STEPS = [
  { step: 1, title: "Property Details", subtitle: "Add property information" },
  { step: 2, title: "Upload Images", subtitle: "Add property photos" },
  { step: 3, title: "Contact Details", subtitle: "Owner contact information" },
  { step: 4, title: "Map Location", subtitle: "Mark property on Google Maps" },
  { step: 5, title: "Review & Submit", subtitle: "Review and submit listing" },
];

interface PropertyStepWizardProps {
  leadId?: string;
  bucket?: string;
}

export function PropertyStepWizard({ leadId, bucket = "properties" }: PropertyStepWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [draft, setDraft] = useState<PropertyListingWizardDraft>(INITIAL_PROPERTY_WIZARD_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [leadData, setLeadData] = useState<{ name?: string; phone?: string } | null>(null);

  // If leadId is passed, fetch lead info to prefill contact
  useEffect(() => {
    if (!leadId) return;
    let active = true;
    (async () => {
      try {
        const { data } = await api.get<{ name?: string; phone?: string; leadOwner?: string }>(
          `/crm/leads/${leadId}`
        );
        if (active && data) {
          setLeadData({ name: data.name, phone: data.phone });
          setDraft((prev) => ({
            ...prev,
            ownerName: prev.ownerName || data.name || "",
            phoneNumber: prev.phoneNumber || (data.phone ? `+91 ${data.phone.replace(/[^\d]/g, "")}` : ""),
            isLeadContact: true,
          }));
        }
      } catch (e) {
        console.warn("Failed to fetch lead for prefill:", e);
      }
    })();
    return () => {
      active = false;
    };
  }, [leadId]);

  const handleChange = <K extends keyof PropertyListingWizardDraft>(
    key: K,
    value: PropertyListingWizardDraft[K]
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validateStep = (stepNumber: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (stepNumber === 1) {
      if (!draft.state?.trim()) newErrors.state = "State / Union Territory is required";
      if (!draft.district?.trim()) newErrors.district = "District is required";
      if (!draft.city?.trim()) newErrors.city = "City / Village name is required";
      if (draft.pincode?.trim() && !/^\d{6}$/.test(draft.pincode.trim())) {
        newErrors.pincode = "Pin code must be exactly 6 digits";
      }
      if (!draft.area?.trim() || isNaN(Number(draft.area)) || Number(draft.area) <= 0) {
        newErrors.area = "Valid positive area is required";
      }
      if (!draft.totalPrice?.trim() || isNaN(Number(draft.totalPrice)) || Number(draft.totalPrice) <= 0) {
        newErrors.totalPrice = "Valid total price is required";
      }
      if (draft.description?.trim() && draft.description.trim().split(/\s+/).length > 250) {
        newErrors.description = "Description cannot exceed 250 words";
      }

      // Landmark conditional validation
      if (draft.landMark.includes("Airport") && !draft.landMarkName.airport?.trim()) {
        newErrors.airportName = "Please enter the Airport Name";
      }
      if (draft.landMark.includes("Highway") && !draft.landMarkName.highway?.trim()) {
        newErrors.highwayName = "Please enter the Highway Name";
      }
      if (draft.landMark.includes("Tourist Spot") && !draft.landMarkName.touristSpot?.trim()) {
        newErrors.touristSpotName = "Please enter the Tourist Spot Name";
      }
    } else if (stepNumber === 2) {
      if (isImageUploading) {
        newErrors.images = "Please wait for images to finish uploading";
      } else if (draft.images.length === 0) {
        newErrors.images = "At least one property image is required";
      }
    } else if (stepNumber === 3) {
      if (!draft.ownerName?.trim() || draft.ownerName.trim().length < 2) {
        newErrors.ownerName = "Owner name is required (min 2 characters)";
      }
      const rawPhone = (draft.phoneNumber || "").replace(/[^\d]/g, "");
      if (!rawPhone) {
        newErrors.phoneNumber = "Phone number is required";
      } else if (rawPhone.length < 7 || rawPhone.length > 15) {
        newErrors.phoneNumber = "Enter a valid phone number (7-15 digits)";
      }

      if (draft.whatsappNumber?.trim()) {
        const rawWa = draft.whatsappNumber.replace(/[^\d]/g, "");
        if (rawWa.length < 7 || rawWa.length > 15) {
          newErrors.whatsappNumber = "Enter a valid WhatsApp number (7-15 digits)";
        }
      }
    } else if (stepNumber === 4) {
      // Step 4: Valid if mapLocation is chosen OR if boundary coordinates are drawn
      if (!draft.mapLocation && (!draft.mapCoordinates || draft.mapCoordinates.length < 3)) {
        newErrors.mapLocation = "Please select a location or draw property boundaries on the map";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    const newErrors: Record<string, string> = {};

    if (currentStep === 1) {
      if (!draft.state?.trim()) newErrors.state = "State / Union Territory is required";
      if (!draft.district?.trim()) newErrors.district = "District is required";
      if (!draft.city?.trim() || draft.city.trim().length < 2) {
        newErrors.city = "Valid City / Village name is required (min 2 characters)";
      }
      if (!draft.pincode?.trim()) {
        newErrors.pincode = "Pin code is required";
      } else if (!/^[1-9][0-9]{5}$/.test(draft.pincode.trim())) {
        newErrors.pincode = "Enter a valid 6-digit Indian PIN code (e.g. 302001)";
      }
      if (!draft.area?.trim() || isNaN(Number(draft.area)) || Number(draft.area) <= 0) {
        newErrors.area = "Valid positive area number is required (e.g. 5)";
      } else if (Number(draft.area) > 10000000) {
        newErrors.area = "Area value is unrealistically large";
      }
      if (!draft.totalPrice?.trim() || isNaN(Number(draft.totalPrice)) || Number(draft.totalPrice) <= 0) {
        newErrors.totalPrice = "Valid positive total price is required (e.g. 500000)";
      } else if (Number(draft.totalPrice) < 1000) {
        newErrors.totalPrice = "Total price must be at least ₹1,000";
      }
      if (draft.khasraNumber?.trim() && !/^[a-zA-Z0-9\/\-_\s]{1,30}$/.test(draft.khasraNumber.trim())) {
        newErrors.khasraNumber = "Khasra number can only contain letters, numbers, slashes, or dashes";
      }
      if (draft.waterLevel?.trim() && (isNaN(Number(draft.waterLevel)) || Number(draft.waterLevel) <= 0 || Number(draft.waterLevel) > 3000)) {
        newErrors.waterLevel = "Water level must be a realistic depth between 1 and 3,000 ft";
      }
      if (draft.roadAccess && draft.roadAccessWidth?.trim() && (isNaN(Number(draft.roadAccessWidth)) || Number(draft.roadAccessWidth) <= 0)) {
        newErrors.roadAccessWidth = "Road width must be a positive number in feet";
      }
      if (!draft.roadAccess && draft.roadAccessDistance?.trim() && (isNaN(Number(draft.roadAccessDistance)) || Number(draft.roadAccessDistance) < 0)) {
        newErrors.roadAccessDistance = "Distance to main road must be a valid positive number";
      }
      if (draft.description?.trim() && draft.description.trim().split(/\s+/).length > 250) {
        newErrors.description = "Description cannot exceed 250 words";
      }
      if (draft.landMark.includes("Airport") && !draft.landMarkName.airport?.trim()) {
        newErrors.airportName = "Please enter the Airport Name";
      }
      if (draft.landMark.includes("Highway") && !draft.landMarkName.highway?.trim()) {
        newErrors.highwayName = "Please enter the Highway Name";
      }
      if (draft.landMark.includes("Tourist Spot") && !draft.landMarkName.touristSpot?.trim()) {
        newErrors.touristSpotName = "Please enter the Tourist Spot Name";
      }
    } else if (currentStep === 2) {
      if (isImageUploading) {
        newErrors.images = "Please wait for images to finish uploading to Azure";
      } else if (draft.images.length === 0) {
        newErrors.images = "At least one property image is required";
      }
    } else if (currentStep === 3) {
      if (!draft.ownerName?.trim() || draft.ownerName.trim().length < 3) {
        newErrors.ownerName = "Full name is required (minimum 3 characters)";
      } else if (!/^[a-zA-Z\s.'-]{3,60}$/.test(draft.ownerName.trim())) {
        newErrors.ownerName = "Name must only contain alphabetic letters and spaces (no numbers or special characters)";
      }

      if (!draft.phoneNumber?.trim()) {
        newErrors.phoneNumber = "Phone number is required";
      } else {
        const isIndia = draft.phoneNumber.startsWith("+91") || !draft.phoneNumber.startsWith("+");
        const digitsOnly = draft.phoneNumber.replace(/^\+\d+\s*/, "").replace(/[^\d]/g, "");

        if (isIndia) {
          if (!/^[6-9]\d{9}$/.test(digitsOnly)) {
            newErrors.phoneNumber = "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 (e.g. 9876543210)";
          }
        } else {
          if (digitsOnly.length < 7 || digitsOnly.length > 15) {
            newErrors.phoneNumber = "Enter a valid international phone number (7-15 digits)";
          }
        }
      }

      if (draft.whatsappNumber?.trim()) {
        const isIndiaWa = draft.whatsappNumber.startsWith("+91") || !draft.whatsappNumber.startsWith("+");
        const waDigits = draft.whatsappNumber.replace(/^\+\d+\s*/, "").replace(/[^\d]/g, "");

        if (isIndiaWa) {
          if (!/^[6-9]\d{9}$/.test(waDigits)) {
            newErrors.whatsappNumber = "Enter a valid 10-digit Indian WhatsApp number starting with 6, 7, 8, or 9";
          }
        } else {
          if (waDigits.length < 7 || waDigits.length > 15) {
            newErrors.whatsappNumber = "Enter a valid international WhatsApp number (7-15 digits)";
          }
        }
      }
    } else if (currentStep === 4) {
      if (!draft.mapLocation && (!draft.mapCoordinates || draft.mapCoordinates.length < 3)) {
        newErrors.mapLocation = "Please select a location or draw property boundaries on the map";
      }
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      if (currentStep < 5) {
        setCurrentStep((s) => s + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } else {
      const firstErrorMsg = Object.values(newErrors)[0];
      toast.error(firstErrorMsg || "Please resolve validation errors before proceeding.");
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      toast.error("Please fix all validation errors before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const title = `${draft.landType} Land in ${draft.city}, ${draft.district || draft.state}`;
      const validImages = draft.images
        .map((img) => img.url)
        .filter(Boolean);

      const mapLandTypeToPropertyType = (
        type?: string
      ): "Apartment" | "Villa" | "Independent House" | "Plot" | "Commercial" | "Office" | "Warehouse" | "Farm" | "Other" => {
        if (!type) return "Plot";
        const allowed = [
          "Apartment",
          "Villa",
          "Independent House",
          "Plot",
          "Commercial",
          "Office",
          "Warehouse",
          "Farm",
          "Other",
        ];
        if (allowed.includes(type)) return type as any;
        switch (type.toLowerCase()) {
          case "agricultural":
            return "Plot";
          case "residential":
            return "Independent House";
          case "commercial":
            return "Commercial";
          case "industrial":
            return "Warehouse";
          case "farmhouse":
            return "Farm";
          default:
            return "Plot";
        }
      };

      const payload = {
        title,
        address: `${draft.city}, ${draft.district ? draft.district + ", " : ""}${draft.state}`,
        city: draft.city,
        district: draft.district,
        state: draft.state,
        zipCode: draft.pincode || undefined,
        country: "India",
        price: parseFloat(draft.totalPrice) || 0,
        currency: "INR",
        propertyType: mapLandTypeToPropertyType(draft.landType),
        listedFor: "Sale" as const,
        areaSqft: parseFloat(draft.area) || 0,
        areaUnit: draft.areaUnit,
        khasraNumber: draft.khasraNumber || undefined,
        pricePerUnit: draft.pricePerUnit || undefined,
        waterLevel: draft.waterLevel ? parseInt(draft.waterLevel, 10) : undefined,
        landMark: draft.landMark.length ? draft.landMark : undefined,
        landMarkName: draft.landMarkName,
        category: draft.category !== "None" ? draft.category : undefined,
        highwayConn: draft.highwayConn,
        landZoning: draft.landZoning,
        ownershipYes: draft.ownershipYes,
        soilType: draft.soilType,
        roadAccess: draft.roadAccess,
        roadAccessDistance: draft.roadAccessDistance ? parseInt(draft.roadAccessDistance, 10) : undefined,
        roadAccessWidth: draft.roadAccessWidth ? parseInt(draft.roadAccessWidth, 10) : undefined,
        roadAccessDistanceUnit: draft.roadAccessDistanceUnit || undefined,
        description: draft.description || undefined,
        status: "Available",
        approvalStatus: "Approved",
        images: validImages.length ? validImages : undefined,
        listerType: draft.listerType,
        contactName: draft.ownerName,
        contactPhone: draft.phoneNumber,
        whatsappNumber: draft.whatsappNumber || undefined,
        mapBoundaries: draft.mapBoundaries || undefined,
        mapCoordinates: draft.mapCoordinates || undefined,
        mapLocation: draft.mapLocation || undefined,
        leadId: leadId || undefined,
      };

      const created = await createBackendPropertyListing(payload);
      toast.success("Property listing created successfully!");
      router.push(`/crm/property-listings/${created._id}`);
    } catch (err: any) {
      console.error("Submission failed:", err);
      toast.error(err?.response?.data?.message || err?.message || "Failed to create property listing");
    } finally {
      setSubmitting(false);
    }
  };

  const activeStepMeta = STEPS[currentStep - 1];

  return (
    <div className="mx-auto w-full max-w-4xl pb-16">
      {/* Top Header */}
      <CrmPageHeader
        icon={<Home size={20} />}
        title="Add New Property"
        description="Fill in the details to list your property with validation and free-form boundary drawing"
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "My Properties", href: `/crm/property-listings?bucket=${bucket}` },
          { label: "Add Property" },
        ]}
        className="mb-6"
      />

      {/* Stepper Container */}
      <div className="mb-8 rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-sm">
        {/* Step Circles & Labels */}
        <div className="relative flex items-center justify-between">
          {STEPS.map((s) => {
            const isDone = s.step < currentStep;
            const isActive = s.step === currentStep;

            return (
              <div
                key={s.step}
                className="relative z-10 flex flex-col items-center cursor-pointer"
                onClick={() => {
                  if (s.step < currentStep) {
                    setCurrentStep(s.step);
                  }
                }}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                    isDone
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                      : isActive
                        ? "bg-emerald-600 text-white ring-4 ring-emerald-500/20 shadow-md shadow-emerald-600/20"
                        : "border border-[var(--border-color)] bg-[var(--surface-dim)] text-[var(--text-muted)]"
                  }`}
                >
                  {isDone ? <Check className="h-5 w-5 stroke-[2.5]" /> : s.step}
                </div>
              </div>
            );
          })}

          {/* Connecting line */}
          <div className="absolute top-5 left-6 right-6 h-0.5 -translate-y-1/2 bg-[var(--border-color)]">
            <div
              className="h-full bg-emerald-600 transition-all duration-500"
              style={{
                width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Current Step Label & Subtitle */}
        <div className="mt-4 text-center">
          <h3 className="text-sm font-bold text-[var(--foreground)]">{activeStepMeta.title}</h3>
          <p className="text-xs text-[var(--text-muted)]">{activeStepMeta.subtitle}</p>
        </div>

        {/* Horizontal Progress Bar */}
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-dim)]">
          <div
            className="h-full rounded-full bg-emerald-600 transition-all duration-500"
            style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="mb-8">
        {currentStep === 1 && (
          <Step1LandDetails draft={draft} onChange={handleChange} errors={errors} />
        )}
        {currentStep === 2 && (
          <Step2UploadImages
            draft={draft}
            onChange={handleChange}
            error={errors.images}
            onUploadingStateChange={setIsImageUploading}
          />
        )}
        {currentStep === 3 && (
          <Step3ContactDetails
            draft={draft}
            onChange={handleChange}
            leadName={leadData?.name}
            leadPhone={leadData?.phone}
            errors={errors}
          />
        )}
        {currentStep === 4 && (
          <Step4MapLocation
            draft={draft}
            onChange={handleChange}
            error={errors.mapLocation}
          />
        )}
        {currentStep === 5 && (
          <Step5ReviewSubmit draft={draft} submitting={submitting} onSubmit={handleSubmit} />
        )}
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-5">
        <div>
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handlePrev}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] shadow-sm hover:bg-[var(--surface-dim)] disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
          )}
        </div>

        <div>
          {currentStep < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={isImageUploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-6 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Property Listing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
