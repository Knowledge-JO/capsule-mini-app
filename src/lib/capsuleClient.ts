import Capsule, { Environment } from "@usecapsule/react-sdk";

const capsule = new Capsule(
  Environment.BETA,
  import.meta.env.VITE_CAPSULE_API_KEY
);

export default capsule;
