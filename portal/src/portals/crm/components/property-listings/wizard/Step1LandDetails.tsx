"use client";

import { useMemo } from "react";
import { Plane, Navigation, Landmark, Check } from "lucide-react";
import {
  CrmInput,
  CrmLabel,
  CrmSelect,
  CrmTextarea,
} from "@/components/crm/ui";

export const INDIAN_STATES_DISTRICTS: Record<string, string[]> = {
  "Andhra Pradesh": ["Anantapur", "Chittoor", "East Godavari", "Guntur", "Krishna", "Kurnool", "Prakasam", "Srikakulam", "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR Kadapa"],
  "Arunachal Pradesh": ["Changlang", "Dibang Valley", "East Kameng", "East Siang", "Papum Pare", "Tawang", "Tirap", "Upper Siang", "West Kameng", "West Siang"],
  "Assam": ["Baksa", "Barpeta", "Cachar", "Darrang", "Dhubri", "Dibrugarh", "Goalpara", "Golaghat", "Guwahati", "Jorhat", "Kamrup", "Nagaon", "Silchar", "Sonitpur", "Tinsukia"],
  "Bihar": ["Araria", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar", "Darbhanga", "Gaya", "Muzaffarpur", "Patna", "Purnia", "Rohtas", "Samastipur", "Vaishali"],
  "Chhattisgarh": ["Bastar", "Bilaspur", "Durg", "Korba", "Raigarh", "Raipur", "Rajnandgaon", "Surguja"],
  "Delhi": ["Central Delhi", "East Delhi", "New Delhi", "North Delhi", "North East Delhi", "North West Delhi", "Shahdara", "South Delhi", "South East Delhi", "South West Delhi", "West Delhi"],
  "Goa": ["North Goa", "South Goa"],
  "Gujarat": ["Ahmedabad", "Amreli", "Anand", "Bharuch", "Bhavnagar", "Gandhinagar", "Jamnagar", "Junagadh", "Kutch", "Mehsana", "Rajkot", "Surat", "Vadodara", "Valsad"],
  "Haryana": ["Ambala", "Faridabad", "Gurugram", "Hisar", "Jhajjar", "Karnal", "Kurukshetra", "Panipat", "Panchkula", "Rewari", "Rohtak", "Sirsa", "Sonipat", "Yamunanagar"],
  "Himachal Pradesh": ["Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Mandi", "Shimla", "Sirmaur", "Solan", "Una"],
  "Jammu & Kashmir": ["Anantnag", "Baramulla", "Budgam", "Doda", "Jammu", "Kathua", "Pulwama", "Srinagar", "Udhampur"],
  "Jharkhand": ["Bokaro", "Deoghar", "Dhanbad", "Dumka", "Hazaribagh", "Jamshedpur", "Ranchi"],
  "Karnataka": ["Bangalore Rural", "Bangalore Urban", "Belgaum", "Bellary", "Bidar", "Dakshina Kannada", "Dharwad", "Gulbarga", "Hassan", "Hubli", "Mangalore", "Mysore", "Shimoga", "Tumkur", "Udupi"],
  "Kerala": ["Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"],
  "Madhya Pradesh": ["Bhopal", "Gwalior", "Indore", "Jabalpur", "Khandwa", "Rewa", "Sagar", "Satna", "Ujjain"],
  "Maharashtra": ["Ahmednagar", "Akola", "Amravati", "Aurangabad", "Kolhapur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nashik", "Navi Mumbai", "Pune", "Solapur", "Thane"],
  "Odisha": ["Balasore", "Berhampur", "Bhadrak", "Bhubaneswar", "Cuttack", "Ganjam", "Puri", "Rourkela", "Sambalpur"],
  "Punjab": ["Amritsar", "Bathinda", "Faridkot", "Firozpur", "Gurdaspur", "Hoshiarpur", "Jalandhar", "Ludhiana", "Mohali", "Pathankot", "Patiala"],
  "Rajasthan": ["Ajmer", "Alwar", "Banswara", "Barmer", "Bharatpur", "Bhilwara", "Bikaner", "Chittorgarh", "Jaipur", "Jaisalmer", "Jodhpur", "Kota", "Sikar", "Udaipur"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Cuddalore", "Dindigul", "Erode", "Kanchipuram", "Madurai", "Salem", "Thanjavur", "Tiruchirappalli", "Tirunelveli", "Vellore"],
  "Telangana": ["Hyderabad", "Karimnagar", "Khammam", "Mahbubnagar", "Medak", "Nalgonda", "Nizamabad", "Rangareddy", "Warangal"],
  "Uttar Pradesh": ["Agra", "Aligarh", "Ayodhya", "Bareilly", "Ghaziabad", "Gorakhpur", "Jhansi", "Kanpur", "Lucknow", "Mathura", "Meerut", "Moradabad", "Noida", "Prayagraj", "Varanasi"],
  "Uttarakhand": ["Dehradun", "Haridwar", "Nainital", "Pauri Garhwal", "Rishikesh", "Roorkee", "Rudrapur", "Udham Singh Nagar"],
  "West Bengal": ["Asansol", "Darjeeling", "Durgapur", "Hooghly", "Howrah", "Kolkata", "Murshidabad", "North 24 Parganas", "Siliguri", "South 24 Parganas"],
  "Chandigarh": ["Chandigarh"],
  "Puducherry": ["Puducherry", "Karaikal", "Mahe", "Yanam"],
  "Ladakh": ["Leh", "Kargil"],
};

export const AREA_UNITS_OPTIONS = [
  "Square Yard",
  "Square Feet",
  "Square Meter",
  "Acre",
  "Hectare",
  "Bigha",
  "Katha",
  "Marla",
  "Kanal",
  "Gunta",
  "Cent",
] as const;

export const LAND_TYPES_OPTIONS = [
  "Agricultural",
  "Residential",
  "Commercial",
  "Industrial",
  "Warehouse",
  "Other",
] as const;

export const SOIL_TYPES_OPTIONS = [
  "Clay",
  "Sandy",
  "Loam",
  "Black Soil",
] as const;

export const OWNERSHIP_CATEGORIES_OPTIONS = [
  "None",
  "SC",
  "ST",
  "OBC",
  "General",
  "Lease",
  "Patta",
] as const;

export interface PropertyListingWizardDraft {
  // Step 1: Land Details
  state: string;
  district: string;
  city: string;
  pincode: string;
  khasraNumber: string;
  area: string;
  areaUnit: string;
  totalPrice: string;
  pricePerUnit: string;

  // Step 1: Site Details
  roadAccess: boolean;
  roadAccessDistance: string;
  roadAccessWidth: string;
  roadAccessDistanceUnit: string;
  highwayConn: boolean;
  waterLevel: string;
  landType: string;
  soilType: string;
  ownershipYes: boolean;
  category: string;
  landZoning: "Applicable" | "Not Applicable";
  description: string;

  // Step 1: Additional Details
  landMark: string[];
  landMarkName: {
    airport?: string;
    highway?: string;
    touristSpot?: string;
  };

  // Step 2: Upload Images
  images: Array<{
    blobPath: string;
    url: string;
    name?: string;
    size?: number;
  }>;

  // Step 3: Contact Details
  listerType: string;
  ownerName: string;
  phoneNumber: string;
  whatsappNumber: string;
  ownerId?: string;
  isLeadContact?: boolean;

  // Step 4: Map Location
  mapLocation: {
    address?: string;
    name?: string;
    placeId?: string;
    lat?: number;
    lng?: number;
  } | null;
  mapBoundaries: Array<{
    type: string;
    coordinates: Array<{ lat: number; lng: number }>;
  }> | null;
  mapCoordinates: Array<{ lat: number; lng: number }> | null;
  calculatedAreaHectares: number;
}

export const INITIAL_PROPERTY_WIZARD_DRAFT: PropertyListingWizardDraft = {
  state: "",
  district: "",
  city: "",
  pincode: "",
  khasraNumber: "",
  area: "",
  areaUnit: "Bigha",
  totalPrice: "",
  pricePerUnit: "0",

  roadAccess: false,
  roadAccessDistance: "",
  roadAccessWidth: "",
  roadAccessDistanceUnit: "Meter",
  highwayConn: false,
  waterLevel: "",
  landType: "Agricultural",
  soilType: "Loam",
  ownershipYes: false,
  category: "None",
  landZoning: "Not Applicable",
  description: "",

  landMark: [],
  landMarkName: {},

  images: [],

  listerType: "OWNER",
  ownerName: "",
  phoneNumber: "",
  whatsappNumber: "",

  mapLocation: null,
  mapBoundaries: null,
  mapCoordinates: null,
  calculatedAreaHectares: 0,
};

interface Step1LandDetailsProps {
  draft: PropertyListingWizardDraft;
  onChange: <K extends keyof PropertyListingWizardDraft>(
    key: K,
    value: PropertyListingWizardDraft[K]
  ) => void;
  errors?: Record<string, string>;
}

export function Step1LandDetails({ draft, onChange, errors = {} }: Step1LandDetailsProps) {
  const districtOptions = useMemo(() => {
    if (!draft.state || !INDIAN_STATES_DISTRICTS[draft.state]) return [];
    return INDIAN_STATES_DISTRICTS[draft.state];
  }, [draft.state]);

  const handlePriceOrAreaChange = (field: "totalPrice" | "area", val: string) => {
    onChange(field, val);
    const newPrice = field === "totalPrice" ? parseFloat(val) : parseFloat(draft.totalPrice);
    const newArea = field === "area" ? parseFloat(val) : parseFloat(draft.area);

    if (!isNaN(newPrice) && !isNaN(newArea) && newArea > 0) {
      const calculated = Math.round(newPrice / newArea);
      onChange("pricePerUnit", String(calculated));
    } else {
      onChange("pricePerUnit", "0");
    }
  };

  const handleLandmarkToggle = (type: "Airport" | "Highway" | "Tourist Spot") => {
    const exists = draft.landMark.includes(type);
    let nextList: string[];
    if (exists) {
      nextList = draft.landMark.filter((item) => item !== type);
      const nextNames = { ...draft.landMarkName };
      if (type === "Airport") delete nextNames.airport;
      if (type === "Highway") delete nextNames.highway;
      if (type === "Tourist Spot") delete nextNames.touristSpot;
      onChange("landMark", nextList);
      onChange("landMarkName", nextNames);
    } else {
      nextList = [...draft.landMark, type];
      onChange("landMark", nextList);
    }
  };

  const handleLandmarkNameChange = (type: "airport" | "highway" | "touristSpot", text: string) => {
    onChange("landMarkName", {
      ...draft.landMarkName,
      [type]: text,
    });
  };

  const wordCount = useMemo(() => {
    const text = draft.description.trim();
    if (!text) return 0;
    return text.split(/\s+/).length;
  }, [draft.description]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* 1. Land Details Section */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2 border-b border-[var(--border-color)] pb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
            1
          </span>
          <h2 className="text-base font-semibold text-[var(--foreground)]">Land Details</h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <CrmLabel htmlFor="state">State / Union Territory *</CrmLabel>
            <CrmSelect
              id="state"
              value={draft.state}
              onChange={(e) => {
                onChange("state", e.target.value);
                onChange("district", "");
              }}
              className={errors.state ? "border-rose-500" : ""}
            >
              <option value="">Select State/UT</option>
              {Object.keys(INDIAN_STATES_DISTRICTS).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </CrmSelect>
            {errors.state && <p className="mt-1 text-xs text-rose-500">{errors.state}</p>}
          </div>

          <div>
            <CrmLabel htmlFor="district">District *</CrmLabel>
            <CrmSelect
              id="district"
              value={draft.district}
              onChange={(e) => onChange("district", e.target.value)}
              disabled={!draft.state}
              className={errors.district ? "border-rose-500" : ""}
            >
              <option value="">Select District</option>
              {districtOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </CrmSelect>
            {errors.district && <p className="mt-1 text-xs text-rose-500">{errors.district}</p>}
          </div>

          <div>
            <CrmLabel htmlFor="city">City / Tehsil / Village *</CrmLabel>
            <CrmInput
              id="city"
              value={draft.city}
              onChange={(e) => onChange("city", e.target.value)}
              placeholder="Enter city/village name"
              className={errors.city ? "border-rose-500" : ""}
            />
            {errors.city && <p className="mt-1 text-xs text-rose-500">{errors.city}</p>}
          </div>

          <div>
            <CrmLabel htmlFor="pincode">Pin Code</CrmLabel>
            <CrmInput
              id="pincode"
              value={draft.pincode}
              maxLength={6}
              onChange={(e) => onChange("pincode", e.target.value.replace(/\D/g, ""))}
              placeholder="Enter 6-digit pin code"
            />
          </div>

          <div>
            <CrmLabel htmlFor="khasraNumber">Khasra Number</CrmLabel>
            <CrmInput
              id="khasraNumber"
              value={draft.khasraNumber}
              onChange={(e) => onChange("khasraNumber", e.target.value)}
              placeholder="Enter Khasra number"
            />
          </div>

          <div>
            <CrmLabel htmlFor="area">Area *</CrmLabel>
            <div className="flex gap-2">
              <CrmInput
                id="area"
                type="number"
                min="0"
                step="any"
                value={draft.area}
                onChange={(e) => handlePriceOrAreaChange("area", e.target.value)}
                placeholder="Enter Area"
                className={`flex-1 ${errors.area ? "border-rose-500" : ""}`}
              />
              <CrmSelect
                id="areaUnit"
                value={draft.areaUnit}
                onChange={(e) => onChange("areaUnit", e.target.value)}
                className="w-36"
              >
                {AREA_UNITS_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </CrmSelect>
            </div>
            {errors.area && <p className="mt-1 text-xs text-rose-500">{errors.area}</p>}
          </div>

          <div>
            <CrmLabel htmlFor="totalPrice">Total Price (₹) *</CrmLabel>
            <CrmInput
              id="totalPrice"
              type="number"
              min="0"
              value={draft.totalPrice}
              onChange={(e) => handlePriceOrAreaChange("totalPrice", e.target.value)}
              placeholder="Enter total price in figures"
              className={errors.totalPrice ? "border-rose-500" : ""}
            />
            {errors.totalPrice && <p className="mt-1 text-xs text-rose-500">{errors.totalPrice}</p>}
          </div>

          <div>
            <CrmLabel htmlFor="pricePerUnit">Price per Unit (₹)</CrmLabel>
            <CrmInput
              id="pricePerUnit"
              value={draft.pricePerUnit}
              onChange={(e) => onChange("pricePerUnit", e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {/* 2. Site Details Section */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2 border-b border-[var(--border-color)] pb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
            2
          </span>
          <h2 className="text-base font-semibold text-[var(--foreground)]">Site Details</h2>
        </div>

        <div className="space-y-5">
          {/* Road Access Toggle */}
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-dim)]/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Road Access</p>
              <p className="text-xs text-[var(--text-muted)]">Check if the property has road access</p>
            </div>
            <button
              type="button"
              onClick={() => onChange("roadAccess", !draft.roadAccess)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                draft.roadAccess ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  draft.roadAccess ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {draft.roadAccess && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 sm:grid-cols-2">
              <div>
                <CrmLabel htmlFor="roadAccessWidth">Road Access Width</CrmLabel>
                <CrmInput
                  id="roadAccessWidth"
                  type="number"
                  placeholder="e.g. 30"
                  value={draft.roadAccessWidth}
                  onChange={(e) => onChange("roadAccessWidth", e.target.value)}
                />
              </div>
              <div>
                <CrmLabel htmlFor="roadAccessDistance">Road Access Distance</CrmLabel>
                <div className="flex gap-2">
                  <CrmInput
                    id="roadAccessDistance"
                    type="number"
                    placeholder="e.g. 100"
                    value={draft.roadAccessDistance}
                    onChange={(e) => onChange("roadAccessDistance", e.target.value)}
                    className="flex-1"
                  />
                  <CrmSelect
                    value={draft.roadAccessDistanceUnit}
                    onChange={(e) => onChange("roadAccessDistanceUnit", e.target.value)}
                    className="w-28"
                  >
                    <option value="Meter">Meter</option>
                    <option value="Feet">Feet</option>
                    <option value="KM">KM</option>
                  </CrmSelect>
                </div>
              </div>
            </div>
          )}

          {/* Highway Connectivity */}
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-dim)]/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Highway/Expressway Connectivity</p>
              <p className="text-xs text-[var(--text-muted)]">Near highway or expressway</p>
            </div>
            <button
              type="button"
              onClick={() => onChange("highwayConn", !draft.highwayConn)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                draft.highwayConn ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  draft.highwayConn ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Grid fields */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <CrmLabel htmlFor="waterLevel">Water Level</CrmLabel>
              <CrmInput
                id="waterLevel"
                type="number"
                value={draft.waterLevel}
                onChange={(e) => onChange("waterLevel", e.target.value)}
                placeholder="In Feets"
              />
            </div>

            <div>
              <CrmLabel htmlFor="landType">Land Type *</CrmLabel>
              <CrmSelect
                id="landType"
                value={draft.landType}
                onChange={(e) => onChange("landType", e.target.value)}
              >
                {LAND_TYPES_OPTIONS.map((lt) => (
                  <option key={lt} value={lt}>
                    {lt}
                  </option>
                ))}
              </CrmSelect>
            </div>

            <div>
              <CrmLabel htmlFor="soilType">Soil Type</CrmLabel>
              <CrmSelect
                id="soilType"
                value={draft.soilType}
                onChange={(e) => onChange("soilType", e.target.value)}
              >
                {SOIL_TYPES_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </CrmSelect>
            </div>

            <div>
              <CrmLabel htmlFor="category">Category</CrmLabel>
              <CrmSelect
                id="category"
                value={draft.category}
                onChange={(e) => onChange("category", e.target.value)}
              >
                {OWNERSHIP_CATEGORIES_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </CrmSelect>
            </div>
          </div>

          {/* Ownership Toggle */}
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-dim)]/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Ownership</p>
              <p className="text-xs text-[var(--text-muted)]">Check if you are the owner</p>
            </div>
            <button
              type="button"
              onClick={() => onChange("ownershipYes", !draft.ownershipYes)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                draft.ownershipYes ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  draft.ownershipYes ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Land Zoning Segmented Control */}
          <div className="flex flex-col gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-dim)]/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Land Zoning</p>
              <p className="text-xs text-[var(--text-muted)]">Zoning applicability</p>
            </div>
            <div className="inline-flex rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-1">
              <button
                type="button"
                onClick={() => onChange("landZoning", "Applicable")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  draft.landZoning === "Applicable"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Applicable
              </button>
              <button
                type="button"
                onClick={() => onChange("landZoning", "Not Applicable")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  draft.landZoning === "Not Applicable"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Not Applicable
              </button>
            </div>
          </div>

          {/* Property Description */}
          <div>
            <div className="flex items-center justify-between">
              <CrmLabel htmlFor="description">Property Description</CrmLabel>
              <span className={`text-xs ${wordCount > 250 ? "text-rose-500 font-semibold" : "text-[var(--text-muted)]"}`}>
                {wordCount}/250 words
              </span>
            </div>
            <CrmTextarea
              id="description"
              rows={4}
              value={draft.description}
              onChange={(e) => onChange("description", e.target.value)}
              placeholder="Describe your property (max 250 words)..."
              className={wordCount > 250 ? "border-rose-500" : ""}
            />
          </div>
        </div>
      </div>

      {/* 3. Additional Details Section */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2 border-b border-[var(--border-color)] pb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
            3
          </span>
          <h2 className="text-base font-semibold text-[var(--foreground)]">Additional Details</h2>
        </div>

        <div className="space-y-4">
          <div>
            <CrmLabel>Land Mark</CrmLabel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Airport */}
              <button
                type="button"
                onClick={() => handleLandmarkToggle("Airport")}
                className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border p-4 transition-all ${
                  draft.landMark.includes("Airport")
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
                    : "border-[var(--border-color)] bg-[var(--surface-dim)] text-[var(--text-muted)] hover:border-[var(--border-color-hover)] hover:text-[var(--foreground)]"
                }`}
              >
                <Plane className="h-6 w-6" />
                <span className="text-xs">Airport</span>
                {draft.landMark.includes("Airport") && (
                  <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
              </button>

              {/* Highway */}
              <button
                type="button"
                onClick={() => handleLandmarkToggle("Highway")}
                className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border p-4 transition-all ${
                  draft.landMark.includes("Highway")
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
                    : "border-[var(--border-color)] bg-[var(--surface-dim)] text-[var(--text-muted)] hover:border-[var(--border-color-hover)] hover:text-[var(--foreground)]"
                }`}
              >
                <Navigation className="h-6 w-6" />
                <span className="text-xs">Highway</span>
                {draft.landMark.includes("Highway") && (
                  <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
              </button>

              {/* Tourist Spot */}
              <button
                type="button"
                onClick={() => handleLandmarkToggle("Tourist Spot")}
                className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border p-4 transition-all ${
                  draft.landMark.includes("Tourist Spot")
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
                    : "border-[var(--border-color)] bg-[var(--surface-dim)] text-[var(--text-muted)] hover:border-[var(--border-color-hover)] hover:text-[var(--foreground)]"
                }`}
              >
                <Landmark className="h-6 w-6" />
                <span className="text-xs">Tourist Spot</span>
                {draft.landMark.includes("Tourist Spot") && (
                  <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Conditional Landmark text inputs */}
          {draft.landMark.includes("Airport") && (
            <div>
              <CrmLabel htmlFor="airportName">Airport Name *</CrmLabel>
              <CrmInput
                id="airportName"
                placeholder="Type airport name"
                value={draft.landMarkName.airport || ""}
                onChange={(e) => handleLandmarkNameChange("airport", e.target.value)}
                className={errors.airportName ? "border-rose-500" : ""}
              />
              {errors.airportName && <p className="mt-1 text-xs text-rose-500">{errors.airportName}</p>}
            </div>
          )}

          {draft.landMark.includes("Highway") && (
            <div>
              <CrmLabel htmlFor="highwayName">Highway Name *</CrmLabel>
              <CrmInput
                id="highwayName"
                placeholder="Type highway name"
                value={draft.landMarkName.highway || ""}
                onChange={(e) => handleLandmarkNameChange("highway", e.target.value)}
                className={errors.highwayName ? "border-rose-500" : ""}
              />
              {errors.highwayName && <p className="mt-1 text-xs text-rose-500">{errors.highwayName}</p>}
            </div>
          )}

          {draft.landMark.includes("Tourist Spot") && (
            <div>
              <CrmLabel htmlFor="touristSpotName">Tourist Spot Name *</CrmLabel>
              <CrmInput
                id="touristSpotName"
                placeholder="Type tourist spot name"
                value={draft.landMarkName.touristSpot || ""}
                onChange={(e) => handleLandmarkNameChange("touristSpot", e.target.value)}
                className={errors.touristSpotName ? "border-rose-500" : ""}
              />
              {errors.touristSpotName && <p className="mt-1 text-xs text-rose-500">{errors.touristSpotName}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
