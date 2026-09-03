"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Home,
  Loader2,
  FileText,
  Image as ImageIcon,
  User,
  MapPin,
  Save,
  CheckCircle2,
  ArrowLeft,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import {
  CrmButton,
  CrmPageHeader,
} from "@/components/crm/ui";
import CrmRecordDetailSkeleton from "@/components/crm/records/detail/CrmRecordDetailSkeleton";
import {
  Step1LandDetails,
  INITIAL_PROPERTY_WIZARD_DRAFT,
  normalizeIndianState,
  normalizeIndianDistrict,
  type PropertyListingWizardDraft,
} from "@/components/crm/property-listings/wizard/Step1LandDetails";
import { Step2UploadImages } from "@/components/crm/property-listings/wizard/Step2UploadImages";
import { Step3ContactDetails } from "@/components/crm/property-listings/wizard/Step3ContactDetails";
import { Step4MapLocation } from "@/components/crm/property-listings/wizard/Step4MapLocation";
import {
  updateBackendPropertyListing,
} from "@/lib/crm/property-listings/backend-api";
import { CRM_API_URL } from "@/lib/crm/config";

type EditTab = "all" | "details" | "images" | "contact" | "map";

export default function EditPropertyListingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const slugOrId = params.id;

  const [activeTab, setActiveTab] = useState<EditTab>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [draft, setDraft] = useState<PropertyListingWizardDraft>(INITIAL_PROPERTY_WIZARD_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [originalTitle, setOriginalTitle] = useState("");
  const [propertyIdToUpdate, setPropertyIdToUpdate] = useState<string>(slugOrId);
  const [canonicalSlug, setCanonicalSlug] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      // 1. Query 2Bigha GraphQL getPropertyBySlug directly
      let liveRes = await fetch(
        `${CRM_API_URL}/crm/property-listings/twobigha/by-slug/${encodeURIComponent(slugOrId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      let liveData = liveRes.ok ? await liveRes.json().catch(() => null) : null;

      // 2. If slug was an ID / UUID, lookup the document to get the slug and call getPropertyBySlug
      if (!liveData || !liveData.property) {
        const docRes = await fetch(`${CRM_API_URL}/crm/property-listings/${slugOrId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (docRes.ok) {
          const doc = await docRes.json().catch(() => null);
          setPropertyIdToUpdate(doc?._id || slugOrId);

          const resolvedSlug =
            doc?.slug ||
            doc?.twobighaDetail?.seo?.slug ||
            (doc?.title ? doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") : undefined);

          if (resolvedSlug) {
            setCanonicalSlug(resolvedSlug);
            const secondRes = await fetch(
              `${CRM_API_URL}/crm/property-listings/twobigha/by-slug/${encodeURIComponent(resolvedSlug)}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (secondRes.ok) {
              liveData = await secondRes.json().catch(() => null);
            }
          }

          if (!liveData && doc) {
            liveData = {
              property: doc.twobighaDetail?.property || doc.twobighaDetail || doc,
              seo: { slug: doc.slug || resolvedSlug },
            };
          }
        }
      }

      if (liveData && liveData.property) {
        const prop = liveData.property;
        setOriginalTitle(prop.title || prop.propertyName || "Property");
        if (prop.id) setPropertyIdToUpdate(prop.id);
        if (liveData.seo?.slug) setCanonicalSlug(liveData.seo.slug);

        // Extract GraphQL images
        const rawImages =
          Array.isArray(liveData.images) && liveData.images.length > 0
            ? liveData.images
            : Array.isArray(prop.images) && prop.images.length > 0
            ? prop.images
            : [];

        const imgList = rawImages.map((img: any) => {
          const url =
            typeof img === "string"
              ? img
              : img?.url ||
                img?.imageUrl ||
                img?.variants?.original ||
                img?.variants?.large ||
                img?.variants?.medium ||
                "";
          const blobMatch = url.match(/properties\/temp\/[^?#\s]+/i);
          const blobPath =
            typeof img === "object" && img?.blobPath
              ? img.blobPath
              : blobMatch
              ? blobMatch[0]
              : url;
          return {
            url,
            blobPath,
            name: url.split("/").pop() || "image.jpg",
          };
        });

        // Area Unit Mapping
        const rawAreaUnit = prop.areaUnit || "BIGHA";
        const areaUnitMap: Record<string, string> = {
          BIGHA: "Bigha",
          BIGHAS: "Bigha",
          SQFT: "Square Feet",
          SQUARE_FEET: "Square Feet",
          SQYRD: "Square Yard",
          SQM: "Square Meter",
          ACRE: "Acre",
          HECTARE: "Hectare",
          KATHA: "Katha",
          MARLA: "Marla",
          KANAL: "Kanal",
          GUNTA: "Gunta",
          CENT: "Cent",
        };
        const resolvedAreaUnit = areaUnitMap[String(rawAreaUnit).toUpperCase()] || "Bigha";

        // Land Type Mapping
        const rawType = prop.propertyType || "PLOT";
        const landTypeMap: Record<string, string> = {
          PLOT: "Plot",
          AGRICULTURAL: "Agricultural",
          FARMLAND: "Farmland",
          FARMHOUSE: "Farmhouse",
          RESIDENTIAL: "Residential",
          COMMERCIAL: "Commercial",
          INDUSTRIAL: "Industrial",
          WAREHOUSE: "Warehouse",
          OFFICE: "Office",
          APARTMENT: "Apartment",
          VILLA: "Villa",
        };
        const resolvedLandType = landTypeMap[String(rawType).toUpperCase()] || "Agricultural";

        // Map Location & coordinates
        let resolvedMapCoords: Array<{ lat: number; lng: number }> | null = null;
        let resolvedMapBoundaries: any = null;

        if (prop.geoJson?.coordinates && Array.isArray(prop.geoJson.coordinates)) {
          resolvedMapCoords = prop.geoJson.coordinates;
          resolvedMapBoundaries = [
            {
              type: "Polygon",
              coordinates: prop.geoJson.coordinates,
              area: prop.geoJson.area || prop.calculatedArea,
            },
          ];
        } else if (prop.boundary) {
          if (Array.isArray(prop.boundary)) {
            resolvedMapBoundaries = prop.boundary;
            if (prop.boundary[0]?.coordinates) {
              resolvedMapCoords = prop.boundary[0].coordinates;
            }
          } else if (
            typeof prop.boundary === "object" &&
            (prop.boundary as any).coordinates
          ) {
            resolvedMapCoords = (prop.boundary as any).coordinates;
            resolvedMapBoundaries = [prop.boundary];
          }
        } else if (prop.boundaries && Array.isArray(prop.boundaries)) {
          resolvedMapBoundaries = prop.boundaries;
          if (prop.boundaries[0]?.coordinates) {
            resolvedMapCoords = prop.boundaries[0].coordinates;
          }
        } else if (prop.mapBoundaries) {
          resolvedMapBoundaries = Array.isArray(prop.mapBoundaries)
            ? prop.mapBoundaries
            : [prop.mapBoundaries];
          if (resolvedMapBoundaries[0]?.coordinates) {
            resolvedMapCoords = resolvedMapBoundaries[0].coordinates;
          }
        }

        if (
          !resolvedMapCoords &&
          prop.coordinates &&
          Array.isArray(prop.coordinates)
        ) {
          resolvedMapCoords = prop.coordinates;
          if (!resolvedMapBoundaries) {
            resolvedMapBoundaries = [{ type: "Polygon", coordinates: prop.coordinates }];
          }
        }

        let resolvedMapLocation = null;
        if (prop.location || prop.mapLocation) {
          const loc = prop.location || prop.mapLocation;
          resolvedMapLocation = {
            name: loc.name || prop.title,
            address: loc.address || prop.address,
            lat:
              loc.lat ||
              loc.coordinates?.lat ||
              (prop.latLng ? parseFloat(String(prop.latLng).split(",")[0]) : undefined),
            lng:
              loc.lng ||
              loc.coordinates?.lng ||
              (prop.latLng ? parseFloat(String(prop.latLng).split(",")[1]) : undefined),
          };
        } else if (prop.latLng) {
          const parts = String(prop.latLng).split(",");
          resolvedMapLocation = {
            name: prop.title,
            address: prop.address,
            lat: parseFloat(parts[0]),
            lng: parseFloat(parts[1]),
          };
        }

        const resolvedState = normalizeIndianState(prop.state || "Rajasthan");
        let resolvedDistrict = normalizeIndianDistrict(resolvedState, prop.district || "");
        if (!resolvedDistrict && (prop.city || prop.address)) {
          resolvedDistrict = normalizeIndianDistrict(
            resolvedState,
            prop.city || prop.address || ""
          );
        }

        let resolvedArea =
          prop.area != null && String(prop.area) !== "" && String(prop.area) !== "0"
            ? String(prop.area)
            : prop.areaSqft != null && String(prop.areaSqft) !== "0"
            ? String(prop.areaSqft)
            : prop.areaValue != null && String(prop.areaValue) !== "0"
            ? String(prop.areaValue)
            : "";

        if (
          !resolvedArea &&
          prop.price &&
          prop.pricePerUnit &&
          parseFloat(prop.pricePerUnit) > 0
        ) {
          resolvedArea = String(
            Math.round(parseFloat(prop.price) / parseFloat(prop.pricePerUnit))
          );
        }

        let resolvedKhasra = prop.khasraNumber || "";
        if (!resolvedKhasra && prop.title) {
          const m = String(prop.title).match(/khasra\s*(?:no\.?|number)?\s*([0-9a-zA-Z/-]+)/i);
          if (m) resolvedKhasra = m[1];
        }

        const resolvedPincode =
          prop.pinCode ||
          prop.zipCode ||
          (prop.address ? (String(prop.address).match(/\b\d{6}\b/) || [])[0] : "") ||
          "";

        const resolvedOwnerName =
          prop.ownerName ||
          prop.contactName ||
          prop.name ||
          (liveData.user?.firstName
            ? `${liveData.user.firstName || ""} ${liveData.user.lastName || ""}`.trim()
            : "");

        const resolvedPhoneNumber =
          prop.ownerPhone ||
          prop.contactPhone ||
          prop.phone ||
          liveData.user?.phone ||
          "";

        setDraft({
          landType: resolvedLandType,
          state: resolvedState,
          district: resolvedDistrict,
          city: prop.city || "",
          pincode: resolvedPincode,
          khasraNumber: resolvedKhasra,
          area: resolvedArea,
          areaUnit: resolvedAreaUnit,
          totalPrice: prop.price != null ? String(prop.price) : "",
          pricePerUnit: prop.pricePerUnit != null ? String(prop.pricePerUnit) : "",
          waterLevel: prop.waterLevel != null ? String(prop.waterLevel) : "",
          landMark: Array.isArray(prop.landMark) ? prop.landMark : [],
          landMarkName: prop.landMarkName || {},
          category: prop.category || "None",
          highwayConn: Boolean(prop.highwayConn),
          landZoning:
            String(prop.landZoning).toLowerCase() === "applicable"
              ? "Applicable"
              : "Not Applicable",
          ownershipYes: prop.ownershipYes !== false,
          soilType: prop.soilType || "Loam",
          roadAccess: prop.roadAccess !== false,
          roadAccessDistance:
            prop.roadAccessDistance != null ? String(prop.roadAccessDistance) : "",
          roadAccessWidth: prop.roadAccessWidth != null ? String(prop.roadAccessWidth) : "",
          roadAccessDistanceUnit: prop.roadAccessDistanceUnit || "Meter",
          description: prop.description || "",
          images: imgList,
          listerType: prop.listingAs || prop.listerType || "OWNER",
          ownerName: resolvedOwnerName,
          phoneNumber: resolvedPhoneNumber,
          whatsappNumber: prop.ownerWhatsapp || prop.whatsappNumber || "",
          mapBoundaries: resolvedMapBoundaries,
          mapCoordinates: resolvedMapCoords,
          mapLocation: resolvedMapLocation,
          calculatedAreaHectares: prop.calculatedArea || 0,
        });
        return;
      }

      toast.error("Property not found in 2Bigha GraphQL");
    } catch (e: any) {
      toast.error(e?.message || "Failed to query 2Bigha GraphQL");
    } finally {
      setLoading(false);
    }
  }, [slugOrId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onChange = <K extends keyof PropertyListingWizardDraft>(
    key: K,
    value: PropertyListingWizardDraft[K]
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (errors[key as string]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  };

  const handleSave = async () => {
    const newErrors: Record<string, string> = {};

    if (!draft.state) newErrors.state = "State is required";
    if (!draft.city) newErrors.city = "City / Village is required";
    if (!draft.area) newErrors.area = "Area is required";
    if (!draft.totalPrice) newErrors.totalPrice = "Total price is required";
    if (!draft.ownerName) newErrors.ownerName = "Contact name is required";
    if (!draft.phoneNumber) newErrors.phoneNumber = "Phone number is required";

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      toast.error(Object.values(newErrors)[0]);
      return;
    }

    setSaving(true);
    try {
      const validImages = draft.images.map((img) => img.url).filter(Boolean);

      const mapLandTypeToPropertyType = (
        type?: string
      ):
        | "Apartment"
        | "Villa"
        | "Independent House"
        | "Plot"
        | "Commercial"
        | "Office"
        | "Warehouse"
        | "Farm"
        | "Other" => {
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
        title: `${draft.landType} Land in ${draft.city}, ${draft.district || draft.state}`,
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
        roadAccessDistance: draft.roadAccessDistance
          ? parseInt(draft.roadAccessDistance, 10)
          : undefined,
        roadAccessWidth: draft.roadAccessWidth ? parseInt(draft.roadAccessWidth, 10) : undefined,
        roadAccessDistanceUnit: draft.roadAccessDistanceUnit || undefined,
        description: draft.description || undefined,
        images: validImages.length ? validImages : undefined,
        listerType: draft.listerType,
        contactName: draft.ownerName,
        contactPhone: draft.phoneNumber,
        whatsappNumber: draft.whatsappNumber || undefined,
        mapBoundaries: draft.mapBoundaries || undefined,
        mapCoordinates: draft.mapCoordinates || undefined,
        mapLocation: draft.mapLocation || undefined,
      };

      await updateBackendPropertyListing(propertyIdToUpdate, payload);
      toast.success("Listing updated & pushed to 2Bigha GraphQL!");
      router.push(`/crm/property-listings/${encodeURIComponent(canonicalSlug || propertyIdToUpdate)}`);
    } catch (err: any) {
      console.error("Update failed:", err);
      toast.error(
        err?.response?.data?.message || err?.message || "Failed to update property listing"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl p-10">
        <CrmRecordDetailSkeleton />
      </div>
    );
  }

  const tabItems: { id: EditTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "all", label: "All Details", icon: <FileText size={15} /> },
    { id: "details", label: "Property & Land", icon: <Home size={15} /> },
    { id: "images", label: "Photos", icon: <ImageIcon size={15} />, count: draft.images.length },
    { id: "contact", label: "Owner Contact", icon: <User size={15} /> },
    { id: "map", label: "Map & Boundaries", icon: <MapPin size={15} /> },
  ];

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-4xl pb-24 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() =>
              router.push(
                `/crm/property-listings/${encodeURIComponent(canonicalSlug || slugOrId)}`
              )
            }
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
          >
            <ArrowLeft size={13} />
            Back to Property Detail
          </button>
          <div className="flex items-center gap-2">
            <CrmPageHeader
              icon={<Home size={20} className="text-emerald-600" />}
              title={`Edit Listing: ${originalTitle}`}
              description="Live 2Bigha GraphQL getPropertyBySlug hydration with direct mutation sync."
              className="!mb-0"
            />
          </div>
          {canonicalSlug && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <Globe size={12} className="text-emerald-600" />
              <span>Slug: </span>
              <code className="rounded bg-[var(--surface-dim)] px-1.5 py-0.5 font-mono text-emerald-700">
                {canonicalSlug}
              </code>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <CrmButton
            variant="secondary"
            onClick={() =>
              router.push(
                `/crm/property-listings/${encodeURIComponent(canonicalSlug || slugOrId)}`
              )
            }
          >
            Cancel
          </CrmButton>
          <CrmButton
            variant="primary"
            disabled={saving || isImageUploading}
            onClick={() => void handleSave()}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save Changes
          </CrmButton>
        </div>
      </div>

      {/* Navigation Pills */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-3">
        {tabItems.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? "bg-emerald-600 text-white shadow-sm font-semibold"
                  : "bg-[var(--surface-card)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-main)] border border-[var(--border-color)]"
              }`}
            >
              {t.icon}
              {t.label}
              {typeof t.count === "number" && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-[var(--surface-dim)] text-[var(--text-muted)]"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Form Content */}
      <div className="space-y-6">
        {(activeTab === "all" || activeTab === "details") && (
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-main)]">
              <Home size={16} className="text-emerald-600" />
              1. Property & Land Details
            </h2>
            <Step1LandDetails draft={draft} onChange={onChange} errors={errors} />
          </div>
        )}

        {(activeTab === "all" || activeTab === "images") && (
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-main)]">
              <ImageIcon size={16} className="text-emerald-600" />
              2. Property Photos & Media
            </h2>
            <Step2UploadImages
              draft={draft}
              onChange={onChange}
              onUploadingStateChange={setIsImageUploading}
            />
          </div>
        )}

        {(activeTab === "all" || activeTab === "contact") && (
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-main)]">
              <User size={16} className="text-emerald-600" />
              3. Owner & Lister Contact
            </h2>
            <Step3ContactDetails draft={draft} onChange={onChange} errors={errors} />
          </div>
        )}

        {(activeTab === "all" || activeTab === "map") && (
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-main)]">
              <MapPin size={16} className="text-emerald-600" />
              4. Map Location & Boundary Drawing
            </h2>
            <Step4MapLocation draft={draft} onChange={onChange} />
          </div>
        )}
      </div>

      {/* Sticky Bottom Save Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-color)] bg-[var(--surface)]/95 backdrop-blur px-6 py-3 shadow-lg">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span>Directly synced with 2Bigha GraphQL.</span>
          </div>

          <div className="flex items-center gap-2">
            <CrmButton
              variant="secondary"
              onClick={() =>
                router.push(
                  `/crm/property-listings/${encodeURIComponent(canonicalSlug || slugOrId)}`
                )
              }
            >
              Cancel
            </CrmButton>
            <CrmButton
              variant="primary"
              disabled={saving || isImageUploading}
              onClick={() => void handleSave()}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save Changes
            </CrmButton>
          </div>
        </div>
      </div>
    </div>
  );
}
