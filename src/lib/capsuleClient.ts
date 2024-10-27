import Capsule, { Environment } from "@usecapsule/web-sdk";

const capsule = new Capsule(
  Environment.DEVELOPMENT,
  import.meta.env.VITE_CAPSULE_API_KEY
);

export default capsule;
