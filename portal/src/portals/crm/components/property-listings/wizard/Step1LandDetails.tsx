import { useEffect, useRef, useState, useMemo } from "react";
import { Plane, Navigation, Landmark, Check, Search, Loader2, MapPin, Sparkles, Plus, Edit2 } from "lucide-react";
import { toast } from "sonner";
import {
  CrmInput,
  CrmLabel,
  CrmSelect,
  CrmTextarea,
} from "@/components/crm/ui";

export const INDIAN_STATES_DISTRICTS: Record<string, string[]> = {
  "Andhra Pradesh": ["Alluri Sitharama Raju", "Anakapalli", "Ananthapuramu", "Annamayya", "Bapatla", "Chittoor", "Dr. B.R. Ambedkar Konaseema", "East Godavari", "Eluru", "Guntur", "Kakinada", "Krishna", "Kurnool", "Nandyal", "NTR", "Palnadu", "Parvathipuram Manyam", "Prakasam", "Sri Potti Sriramulu Nellore", "Sri Sathya Sai", "Srikakulam", "Tirupati", "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR Kadapa"],
  "Arunachal Pradesh": ["Anjaw", "Changlang", "Dibang Valley", "East Kameng", "East Siang", "Itanagar Capital Complex", "Kamle", "Kra Daadi", "Kurung Kumey", "Lepa Rada", "Lohit", "Longding", "Lower Dibang Valley", "Lower Siang", "Lower Subansiri", "Namsai", "Pakke Kessang", "Papum Pare", "Shi Yomi", "Siang", "Tawang", "Tirap", "Upper Siang", "Upper Subansiri", "West Kameng", "West Siang"],
  "Assam": ["Baksa", "Barpeta", "Biswanath", "Bongaigaon", "Cachar", "Charaideo", "Chirang", "Darrang", "Dhemaji", "Dhubri", "Dibrugarh", "Dima Hasao", "Goalpara", "Golaghat", "Hailakandi", "Hojai", "Jorhat", "Kamrup", "Kamrup Metropolitan", "Karbi Anglong", "Karimganj", "Kokrajhar", "Lakhimpur", "Majuli", "Morigaon", "Nagaon", "Nalbari", "Sivasagar", "Sonitpur", "South Salmara-Mankachar", "Tinsukia", "Udalguri", "West Karbi Anglong"],
  "Bihar": ["Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar", "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur", "Katihar", "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger", "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur", "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran"],
  "Chhattisgarh": ["Balod", "Baloda Bazar", "Balrampur", "Bastar", "Bemetara", "Bijapur", "Bilaspur", "Dantewada", "Dhamtari", "Durg", "Gariaband", "Gaurela-Pendra-Marwahi", "Janjgir-Champa", "Jashpur", "Kabirdham", "Kanker", "Kondagaon", "Korba", "Koriya", "Mahasamund", "Manendragarh-Chirmiri-Bharatpur", "Mohla-Manpur-Ambagarh Chowki", "Mungeli", "Narayanpur", "Raigarh", "Raipur", "Rajnandgaon", "Sarangarh-Bilaigarh", "Sakti", "Sukma", "Surajpur", "Surguja"],
  "Delhi": ["Central Delhi", "East Delhi", "New Delhi", "North Delhi", "North East Delhi", "North West Delhi", "Shahdara", "South Delhi", "South East Delhi", "South West Delhi", "West Delhi"],
  "Goa": ["North Goa", "South Goa"],
  "Gujarat": ["Ahmedabad", "Amreli", "Anand", "Aravalli", "Banaskantha", "Bharuch", "Bhavnagar", "Botad", "Chhota Udaipur", "Dahod", "Dang", "Devbhumi Dwarka", "Gandhinagar", "Gir Somnath", "Jamnagar", "Junagadh", "Kheda", "Kutch", "Mahisagar", "Mehsana", "Morbi", "Narmada", "Navsari", "Panchmahal", "Patan", "Porbandar", "Rajkot", "Sabarkantha", "Surat", "Surendranagar", "Tapi", "Vadodara", "Valsad"],
  "Haryana": ["Ambala", "Bhiwani", "Charkhi Dadri", "Faridabad", "Fatehabad", "Gurugram", "Hisar", "Jhajjar", "Jind", "Kaithal", "Karnal", "Kurukshetra", "Mahendragarh", "Nuh", "Palwal", "Panchkula", "Panipat", "Rewari", "Rohtak", "Sirsa", "Sonipat", "Yamunanagar"],
  "Himachal Pradesh": ["Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Lahaul and Spiti", "Mandi", "Shimla", "Sirmaur", "Solan", "Una"],
  "Jammu & Kashmir": ["Anantnag", "Bandipora", "Baramulla", "Budgam", "Doda", "Ganderbal", "Jammu", "Kathua", "Kishtwar", "Kulgam", "Kupwara", "Poonch", "Pulwama", "Rajouri", "Ramban", "Reasi", "Samba", "Shopian", "Srinagar", "Udhampur"],
  "Jharkhand": ["Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum", "Garhwa", "Giridih", "Godda", "Gumla", "Hazaribagh", "Jamtara", "Khunti", "Koderma", "Latehar", "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Ranchi", "Sahebganj", "Saraikela Kharsawan", "Simdega", "West Singhbhum"],
  "Karnataka": ["Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga", "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayanagara", "Vijayapura", "Yadgir"],
  "Kerala": ["Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"],
  "Madhya Pradesh": ["Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", "Betul", "Bhind", "Bhopal", "Burhanpur", "Chhatarpur", "Chhindwara", "Damoh", "Datia", "Dewas", "Dhar", "Dindori", "Guna", "Gwalior", "Harda", "Narmadapuram", "Indore", "Jabalpur", "Jhabua", "Katni", "Khandwa", "Khargone", "Mandla", "Mandsaur", "Mauganj", "Maihar", "Morena", "Narsinghpur", "Neemuch", "Niwari", "Panna", "Pandhurna", "Raisen", "Rajgarh", "Ratlam", "Rewa", "Sagar", "Satna", "Sehore", "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri", "Sidhi", "Singrauli", "Tikamgarh", "Ujjain", "Umaria", "Vidisha"],
  "Maharashtra": ["Ahmednagar", "Akola", "Amravati", "Chhatrapati Sambhajinagar", "Beed", "Bhandara", "Buldhana", "Chandrapur", "Dhule", "Gadchiroli", "Gondia", "Hingoli", "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded", "Nandurbar", "Nashik", "Dharashiv", "Palghar", "Parbhani", "Pune", "Raigad", "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur", "Thane", "Wardha", "Washim", "Yavatmal"],
  "Manipur": ["Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West", "Jiribam", "Kakching", "Kamjong", "Kangpokpi", "Noney", "Pherzawl", "Senapati", "Tamenglong", "Tengnoupal", "Ukhrul"],
  "Meghalaya": ["East Garo Hills", "East Jaintia Hills", "East Khasi Hills", "Eastern West Khasi Hills", "North Garo Hills", "Ri Bhoi", "South Garo Hills", "South West Garo Hills", "South West Khasi Hills", "West Garo Hills", "West Jaintia Hills", "West Khasi Hills"],
  "Mizoram": ["Aizawl", "Champhai", "Hnahthial", "Khawzawl", "Kolasib", "Lawngtlai", "Lunglei", "Mamit", "Saiha", "Saitual", "Serchhip"],
  "Nagaland": ["Chümoukedima", "Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung", "Mon", "Niuland", "Noklak", "Peren", "Phek", "Shamator", "Tseminyu", "Tuensang", "Wokha", "Zunheboto"],
  "Odisha": ["Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Boudh", "Cuttack", "Deogarh", "Dhenkanal", "Gajapati", "Ganjam", "Jagatsinghpur", "Jajpur", "Jharsuguda", "Kalahandi", "Kandhamal", "Kendrapara", "Kendujhar", "Khordha", "Koraput", "Malkangiri", "Mayurbhanj", "Nabarangpur", "Nayagarh", "Nuapada", "Puri", "Rayagada", "Sambalpur", "Subarnapur", "Sundargarh"],
  "Punjab": ["Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib", "Fazilka", "Firozpur", "Gurdaspur", "Hoshiarpur", "Jalandhar", "Kapurthala", "Ludhiana", "Malerkotla", "Mansa", "Moga", "Muktsar", "Pathankot", "Patiala", "Rupnagar", "Sahibzada Ajit Singh Nagar", "Sangrur", "Shaheed Bhagat Singh Nagar", "Tarn Taran"],
  "Rajasthan": ["Ajmer", "Alwar", "Anupgarh", "Balotra", "Banswara", "Baran", "Barmer", "Beawer", "Bharatpur", "Bhilwara", "Bikaner", "Bundi", "Chittorgarh", "Churu", "Dausa", "Deeg", "Dholpur", "Didwana-Kuchaman", "Dudu", "Dungarpur", "Gangapur City", "Hanumangarh", "Jaipur", "Jaipur Rural", "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Jodhpur Rural", "Karauli", "Kekri", "Khairthal-Tijara", "Kota", "Kotputli-Behror", "Nagaur", "Neem Ka Thana", "Pali", "Phalodi", "Pratapgarh", "Rajsamand", "Salumbar", "Sanchore", "Sawai Madhopur", "Shahpura", "Sikar", "Sirohi", "Sri Ganganagar", "Tonk", "Udaipur"],
  "Sikkim": ["Gangtok", "Gyalsshing", "Pakyong", "Soreng", "Mangan", "Namchi"],
  "Tamil Nadu": ["Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul", "Erode", "Kanchipuram", "Kanyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore", "Viluppuram", "Virudhunagar"],
  "Telangana": ["Adilabad", "Bhadradri Kothagudem", "Hanamkonda", "Hyderabad", "Jagtial", "Jangaon", "Jayashankar Bhupalpally", "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam", "Kumuram Bheem Asifabad", "Mahabubabad", "Mahbubnagar", "Mancherial", "Medak", "Medchal-Malkajgiri", "Mulugu", "Nagarkurnool", "Nalgonda", "Narayanpet", "Nirmal", "Nizamabad", "Peddapalli", "Rajanna Sircilla", "Rangareddy", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad", "Wanaparthy", "Warangal", "Yadadri Bhuvanagiri"],
  "Tripura": ["Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala", "South Tripura", "Unakoti", "West Tripura"],
  "Uttar Pradesh": ["Agra", "Aligarh", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya", "Ayodhya", "Azamgarh", "Baghpat", "Bahraich", "Ballia", "Balrampur", "Banda", "Barabanki", "Bareilly", "Basti", "Bhadohi", "Bijnor", "Budaun", "Bulandshahr", "Chandauli", "Chitrakoot", "Deoria", "Etah", "Etawah", "Farrukhabad", "Fatehpur", "Firozabad", "Gautam Buddha Nagar", "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur", "Hamirpur", "Hapur", "Hardoi", "Hathras", "Jalaun", "Jaunpur", "Jhansi", "Kannauj", "Kanpur Dehat", "Kanpur Nagar", "Kasganj", "Kaushambi", "Kheri", "Kushinagar", "Lalitpur", "Lucknow", "Maharajganj", "Mahoba", "Mainpuri", "Mathura", "Mau", "Meerut", "Mirzapur", "Moradabad", "Muzaffarnagar", "Pilibhit", "Pratapgarh", "Prayagraj", "Raebareli", "Rampur", "Saharanpur", "Sambhal", "Sant Kabir Nagar", "Shahjahanpur", "Shamli", "Shravasti", "Siddharthnagar", "Sitapur", "Sonbhadra", "Sultanpur", "Unnao", "Varanasi"],
  "Uttarakhand": ["Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun", "Haridwar", "Nainital", "Pauri Garhwal", "Pithoragarh", "Rudraprayag", "Tehri Garhwal", "Udham Singh Nagar", "Uttarkashi"],
  "West Bengal": ["Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Dakshin Dinajpur", "Darjeeling", "Hooghly", "Howrah", "Jalpaiguri", "Jhargram", "Kalimpong", "Kolkata", "Malda", "Murshidabad", "Nadia", "North 24 Parganas", "Paschim Bardhaman", "Paschim Medinipur", "Purba Bardhaman", "Purba Medinipur", "Purulia", "South 24 Parganas", "Uttar Dinajpur"],
  "Andaman & Nicobar": ["Nicobar", "North and Middle Andaman", "South Andaman"],
  "Chandigarh": ["Chandigarh"],
  "Dadra & Nagar Haveli and Daman & Diu": ["Daman", "Diu", "Dadra and Nagar Haveli"],
  "Lakshadweep": ["Lakshadweep"],
  "Puducherry": ["Karaikal", "Mahe", "Puducherry", "Yanam"],
  "Ladakh": ["Kargil", "Leh"],
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
  email?: string;
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

declare global {
  interface Window {
    google?: any;
    initGoogleMapsPromise?: Promise<void>;
  }
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();

  if (window.initGoogleMapsPromise) return window.initGoogleMapsPromise;

  window.initGoogleMapsPromise = new Promise((resolve) => {
    const existingScript = document.getElementById("google-maps-script");
    if (existingScript) {
      if (window.google?.maps) {
        resolve();
      } else {
        existingScript.addEventListener("load", () => resolve());
      }
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      console.warn("Failed to load Google Maps script.");
      resolve();
    };
    document.head.appendChild(script);
  });

  return window.initGoogleMapsPromise;
}

export function normalizeIndianState(raw?: string): string {
  if (!raw) return "Rajasthan";
  const clean = raw.trim().toLowerCase().replace(/[-_]+/g, " ");
  for (const state of Object.keys(INDIAN_STATES_DISTRICTS)) {
    const sClean = state.toLowerCase().replace(/[-_&]+/g, " ");
    if (sClean === clean || clean === sClean.replace(/&/g, "and") || clean.includes(sClean) || sClean.includes(clean)) {
      return state;
    }
  }
  return raw;
}

export function normalizeIndianDistrict(state: string, raw?: string): string {
  if (!raw) return "";
  const validState = normalizeIndianState(state);
  const districts = INDIAN_STATES_DISTRICTS[validState] || [];
  const clean = raw.trim().toLowerCase().replace(/[-_]+/g, " ");
  for (const d of districts) {
    const dClean = d.toLowerCase().replace(/[-_]+/g, " ");
    if (dClean === clean || clean.includes(dClean) || dClean.includes(clean)) {
      return d;
    }
  }
  return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1);
}

function findBestDistrictMatch(state: string, rawCandidates: string[]): string {
  const normState = normalizeIndianState(state);
  const options = INDIAN_STATES_DISTRICTS[normState] || [];
  if (!options.length || !rawCandidates.length) return "";

  for (const raw of rawCandidates) {
    if (!raw) continue;

    // Clean up raw candidate string
    const cleanRaw = raw
      .replace(/district|dist|division|tehsil|zila/gi, "")
      .trim()
      .toLowerCase();

    if (!cleanRaw) continue;

    // 1. Exact case-insensitive match
    const exact = options.find((o) => o.toLowerCase() === cleanRaw);
    if (exact) return exact;

    // 2. Includes match
    const inc = options.find((o) => {
      const oLower = o.toLowerCase();
      return oLower.includes(cleanRaw) || cleanRaw.includes(oLower);
    });
    if (inc) return inc;

    // 3. Match by first word
    const firstWord = cleanRaw.split(/\s+/)[0];
    if (firstWord.length >= 3) {
      const wordMatch = options.find((o) => o.toLowerCase().startsWith(firstWord));
      if (wordMatch) return wordMatch;
    }
  }

  return "";
}

export function Step1LandDetails({ draft, onChange, errors = {} }: Step1LandDetailsProps) {
  const [isPincodeLoading, setIsPincodeLoading] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isSearchingMap, setIsSearchingMap] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState("");

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);

  const normalizedState = useMemo(() => normalizeIndianState(draft.state), [draft.state]);

  const districtOptions = useMemo(() => {
    const base = normalizedState && INDIAN_STATES_DISTRICTS[normalizedState]
      ? [...INDIAN_STATES_DISTRICTS[normalizedState]]
      : [];

    if (draft.district) {
      const normD = normalizeIndianDistrict(normalizedState, draft.district);
      const exists = base.some((d) => d.toLowerCase() === normD.toLowerCase());
      if (!exists) {
        return [normD, ...base];
      }
    }
    return base;
  }, [normalizedState, draft.district]);

  // Reverse geocode via Google Geocoder across all results for full accuracy
  const reverseGeocodeGoogle = async (lat: number, lng: number) => {
    if (!window.google?.maps?.Geocoder) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
      if (status === "OK" && results && results.length > 0) {
        let state = "";
        let rawDistrictCandidates: string[] = [];
        let city = "";
        let pincode = "";

        for (const res of results) {
          for (const comp of res.address_components || []) {
            const types = comp.types || [];
            if (types.includes("administrative_area_level_1") && !state) {
              state = comp.long_name;
            }
            if (types.includes("administrative_area_level_2")) {
              if (!rawDistrictCandidates.includes(comp.long_name)) {
                rawDistrictCandidates.push(comp.long_name);
              }
            }
            if (types.includes("administrative_area_level_3") || types.includes("sublocality_level_1")) {
              if (!rawDistrictCandidates.includes(comp.long_name)) {
                rawDistrictCandidates.push(comp.long_name);
              }
            }
            if (
              (types.includes("locality") ||
                types.includes("sublocality_level_1") ||
                types.includes("neighborhood") ||
                types.includes("administrative_area_level_3")) &&
              !city
            ) {
              city = comp.long_name;
            }
            if (types.includes("postal_code") && !pincode) {
              pincode = comp.long_name;
            }
          }
        }

        let matchedState = Object.keys(INDIAN_STATES_DISTRICTS).find(
          (s) => s.toLowerCase() === state.toLowerCase()
        ) || state;

        const matchedDistrict =
          findBestDistrictMatch(matchedState, rawDistrictCandidates) ||
          rawDistrictCandidates[0] ||
          "";

        if (matchedState) onChange("state", matchedState);
        if (matchedDistrict) onChange("district", matchedDistrict);
        if (city) onChange("city", city);
        if (pincode) {
          const cleanPin = pincode.replace(/\D/g, "").slice(0, 6);
          onChange("pincode", cleanPin);
        }

        const addressStr = results[0]?.formatted_address || "";
        setMapSearchQuery(addressStr);
        onChange("mapLocation", {
          address: addressStr,
          lat,
          lng,
        });

        toast.success(`Location set: ${matchedDistrict || city || "Pointed on Map"}`);
      }
    });
  };

  // Initialize Google Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const apiKey =
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      "";

    loadGoogleMapsScript(apiKey).then(() => {
      if (!window.google?.maps || !mapContainerRef.current || mapInstanceRef.current) return;

      const initialLat = draft.mapLocation?.lat || 20.5937;
      const initialLng = draft.mapLocation?.lng || 78.9629;
      const initialZoom = draft.mapLocation?.lat ? 14 : 5;

      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: { lat: initialLat, lng: initialLng },
        zoom: initialZoom,
        mapTypeId: window.google.maps.MapTypeId.HYBRID,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
      });

      mapInstanceRef.current = map;
      setIsMapLoaded(true);

      // Create initial marker if set
      if (draft.mapLocation?.lat && draft.mapLocation?.lng) {
        const marker = new window.google.maps.Marker({
          position: { lat: draft.mapLocation.lat, lng: draft.mapLocation.lng },
          map,
          draggable: true,
          animation: window.google.maps.Animation.DROP,
        });
        markerInstanceRef.current = marker;

        marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          if (pos) {
            void reverseGeocodeGoogle(pos.lat(), pos.lng());
          }
        });
      }

      // Map click listener
      map.addListener("click", (e: any) => {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();

        if (markerInstanceRef.current) {
          markerInstanceRef.current.setPosition({ lat, lng });
        } else {
          const marker = new window.google.maps.Marker({
            position: { lat, lng },
            map: mapInstanceRef.current,
            draggable: true,
            animation: window.google.maps.Animation.DROP,
          });
          markerInstanceRef.current = marker;
          marker.addListener("dragend", () => {
            const pos = marker.getPosition();
            if (pos) {
              void reverseGeocodeGoogle(pos.lat(), pos.lng());
            }
          });
        }
        void reverseGeocodeGoogle(lat, lng);
      });
    });
  }, []);

  // Search location on Google Map via Geocoder
  const handleMapSearch = async () => {
    if (!mapSearchQuery.trim() || !window.google?.maps?.Geocoder) return;
    setIsSearchingMap(true);

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { address: mapSearchQuery, componentRestrictions: { country: "IN" } },
      (results: any, status: any) => {
        setIsSearchingMap(false);
        if (status === "OK" && results && results[0]) {
          const place = results[0];
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();

          if (mapInstanceRef.current) {
            mapInstanceRef.current.setCenter({ lat, lng });
            mapInstanceRef.current.setZoom(14);
          }

          if (markerInstanceRef.current) {
            markerInstanceRef.current.setPosition({ lat, lng });
          } else if (mapInstanceRef.current) {
            const marker = new window.google.maps.Marker({
              position: { lat, lng },
              map: mapInstanceRef.current,
              draggable: true,
              animation: window.google.maps.Animation.DROP,
            });
            markerInstanceRef.current = marker;
            marker.addListener("dragend", () => {
              const pos = marker.getPosition();
              if (pos) {
                void reverseGeocodeGoogle(pos.lat(), pos.lng());
              }
            });
          }
          void reverseGeocodeGoogle(lat, lng);
        } else {
          toast.error("Location not found on Google Maps");
        }
      }
    );
  };

  // Handle live Postal PIN Code lookup & Map location sync
  const handlePincodeChange = async (pincodeVal: string) => {
    const cleanPin = pincodeVal.replace(/\D/g, "").slice(0, 6);
    onChange("pincode", cleanPin);

    if (cleanPin.length === 6) {
      setIsPincodeLoading(true);
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${cleanPin}`);
        const data = await res.json().catch(() => null);
        if (data && data[0] && data[0].Status === "Success" && data[0].PostOffice?.length) {
          const po = data[0].PostOffice[0];
          const detectedState = po.State;
          const detectedDistrict = po.District;
          const detectedCity = po.Name || po.Block || po.Division;

          let matchedState = Object.keys(INDIAN_STATES_DISTRICTS).find(
            (s) => s.toLowerCase() === detectedState.toLowerCase()
          ) || detectedState;

          const matchedDistrict =
            findBestDistrictMatch(matchedState, [detectedDistrict]) || detectedDistrict || "";

          if (matchedState) onChange("state", matchedState);
          if (matchedDistrict) onChange("district", matchedDistrict);
          if (detectedCity) onChange("city", detectedCity);

          toast.success(`Resolved pincode ${cleanPin}: ${matchedDistrict || detectedDistrict}, ${matchedState}`);
        }

        // Sync Google Map pin to the manually entered PIN code
        if (window.google?.maps?.Geocoder) {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode(
            { address: `${cleanPin}, India`, componentRestrictions: { country: "IN" } },
            (results: any, status: any) => {
              if (status === "OK" && results && results[0]) {
                const place = results[0];
                const lat = place.geometry.location.lat();
                const lng = place.geometry.location.lng();

                if (mapInstanceRef.current) {
                  mapInstanceRef.current.setCenter({ lat, lng });
                  mapInstanceRef.current.setZoom(13);
                }

                if (markerInstanceRef.current) {
                  markerInstanceRef.current.setPosition({ lat, lng });
                } else if (mapInstanceRef.current) {
                  const marker = new window.google.maps.Marker({
                    position: { lat, lng },
                    map: mapInstanceRef.current,
                    draggable: true,
                    animation: window.google.maps.Animation.DROP,
                  });
                  markerInstanceRef.current = marker;
                  marker.addListener("dragend", () => {
                    const pos = marker.getPosition();
                    if (pos) {
                      void reverseGeocodeGoogle(pos.lat(), pos.lng());
                    }
                  });
                }

                const addr = place.formatted_address || `${cleanPin}, India`;
                setMapSearchQuery(addr);
                onChange("mapLocation", {
                  address: addr,
                  lat,
                  lng,
                });
              }
            }
          );
        }
      } catch (e) {
        console.error("PIN code lookup failed", e);
      } finally {
        setIsPincodeLoading(false);
      }
    }
  };

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
        <div className="mb-5 flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
              1
            </span>
            <h2 className="text-base font-semibold text-[var(--foreground)]">Land Details</h2>
          </div>
          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-200/60">
            <Sparkles size={13} /> Live Location & Postal Resolution
          </span>
        </div>

        {/* Interactive Pin Location Map */}
        <div className="mb-6 rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-transparent p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <label className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <MapPin size={15} className="text-emerald-600" /> Point Location on Map (Click or Drag Pin)
              </label>
              <p className="text-[11px] text-text-muted mt-0.5">
                Click anywhere on map to set property location & auto-fill address details.
              </p>
            </div>
            {draft.mapLocation?.lat != null && draft.mapLocation?.lng != null && (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 dark:bg-emerald-950/60 px-2.5 py-1 rounded-md border border-emerald-300/50 flex items-center gap-1">
                <Check size={12} /> Pin Set: {draft.mapLocation.lat.toFixed(4)}, {draft.mapLocation.lng.toFixed(4)}
              </span>
            )}
          </div>

          {/* Map Search & Pointed Address Input */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={mapSearchQuery}
                onChange={(e) => setMapSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleMapSearch();
                  }
                }}
                placeholder="Search village, city, district or landmark on map..."
                className="w-full rounded-lg border border-emerald-300/70 bg-white dark:bg-slate-900 px-3 py-2 pl-9 text-xs outline-none focus:border-emerald-500 shadow-sm text-[var(--foreground)]"
              />
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600" />
            </div>
            <button
              type="button"
              onClick={() => void handleMapSearch()}
              disabled={isSearchingMap}
              className="text-xs font-semibold py-1.5 px-3 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSearchingMap ? <Loader2 size={13} className="animate-spin" /> : "Search Location"}
            </button>
          </div>

          {/* Map Container */}
          <div className="relative h-64 w-full rounded-lg border border-emerald-200 dark:border-emerald-900/40 overflow-hidden shadow-inner bg-slate-100 dark:bg-slate-900">
            <div ref={mapContainerRef} className="h-full w-full z-0" />
            {!isMapLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-900 text-xs text-text-muted gap-2">
                <Loader2 size={16} className="animate-spin text-emerald-600" /> Loading interactive map...
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <CrmLabel htmlFor="state">State / Union Territory *</CrmLabel>
            <CrmSelect
              id="state"
              value={normalizedState}
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
              value={districtOptions.find((d) => d.toLowerCase() === (draft.district || "").toLowerCase()) || draft.district}
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
              placeholder="Enter city/tehsil/village name"
              className={errors.city ? "border-rose-500" : ""}
            />
            {errors.city && <p className="mt-1 text-xs text-rose-500">{errors.city}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <CrmLabel htmlFor="pincode">Pin Code</CrmLabel>
              {isPincodeLoading && (
                <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-medium animate-pulse">
                  <Loader2 size={11} className="animate-spin" /> Resolving PIN...
                </span>
              )}
            </div>
            <CrmInput
              id="pincode"
              value={draft.pincode}
              maxLength={6}
              onChange={(e) => handlePincodeChange(e.target.value)}
              placeholder="Enter 6-digit pin code (Auto-fetches details)"
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
                value={LAND_TYPES_OPTIONS.find((lt) => lt.toLowerCase() === (draft.landType || "").toLowerCase()) || draft.landType || "Agricultural"}
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
                value={SOIL_TYPES_OPTIONS.find((st) => st.toLowerCase() === (draft.soilType || "").toLowerCase()) || draft.soilType}
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
                value={OWNERSHIP_CATEGORIES_OPTIONS.find((cat) => cat.toLowerCase() === (draft.category || "").toLowerCase()) || draft.category || "None"}
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
