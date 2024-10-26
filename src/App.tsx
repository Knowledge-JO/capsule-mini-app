import WebApp from "@twa-dev/sdk";
import { useEffect, useState } from "react";
import capsule from "./lib/capsuleClient";
import { WalletType } from "@usecapsule/react-sdk";
import {
  retrieveChunkedData,
  storeWithChunking,
} from "./lib/cloudStorageUtils";

function App() {
  const [address, setAddress] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [userShare, setUserShare] = useState("");
  const [walletId, setWalletId] = useState("");
  const [loadingText, setLoadingText] = useState("");

  useEffect(() => {
    init();
  }, []);

  async function init() {
    setIsLoading(true);
    setLoadingText("Initializing app...");
    try {
      WebApp.ready();

      if (!WebApp.initDataUnsafe.user)
        throw new Error("No user found, open in telegram");

      const userId = WebApp.initDataUnsafe.user.id;
      const username = WebApp.initDataUnsafe.user.username;

      setLoadingText(`Checking ${username} for existing wallet...`);

      const share = await retrieveChunkedData(`share-${userId}`);
      const userWalletId = await retrieveChunkedData(`walletId-${userId}`);
      const userAddress = await retrieveChunkedData(`address-${userId}`);

      if (share && userWalletId) {
        setUserShare(share);
        setWalletId(userWalletId);
        setAddress(userAddress);
        await capsule.setUserShare(share);
      } else {
        setLoadingText(`Not existing wallet found for user - ${username}`);
      }
    } catch (error) {
      console.log("Error initializzing app", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function generateWallet() {
    setIsLoading(true);
    try {
      const userId = WebApp.initDataUnsafe.user?.id;
      if (!userId) throw new Error("No userId");

      const pregenWallet = await capsule.createWalletPreGen(
        WalletType.EVM,
        `${userId}`
      );

      const share = (await capsule.getUserShare()) || "";
      setUserShare(share);
      setAddress(pregenWallet.address);
      setWalletId(pregenWallet.id);

      // store user share to cloud

      await storeWithChunking(`share-${userId}`, share);
      await storeWithChunking(`walletId-${userId}`, pregenWallet.id);
      if (pregenWallet.address) {
        await storeWithChunking(`address-${userId}`, pregenWallet.address);
      }
    } catch (error) {
      console.log("Error generating wallet", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <p>{loadingText}</p>
      {!userShare && !walletId && (
        <button onClick={generateWallet} disabled={isLoading}>
          Generate wallet
        </button>
      )}
      <p>Wallet address: {address}</p>
    </div>
  );
}

export default App;
