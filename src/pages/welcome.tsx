import { Navigate, useSearchParams } from "react-router";
import { SignInPanel } from "@/components/auth";
import { ProfileEditor } from "@/components/profile-editor";
import { Skeleton } from "@/components/skeleton";
import { useWallet } from "@/lib/wallet";
import { useTitle } from "@/lib/use-now";
import { safeNext } from "@/pages/signin";

/** First run: choose a username and make the profile yours before anything else. */
export default function WelcomePage() {
  useTitle("Set up your profile");
  const { me, loading } = useWallet();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  if (loading) return <div className="wrap pt-6"><Skeleton className="h-40 w-full" /></div>;
  if (!me?.user)
    return (
      <div className="wrap pt-6">
        <h1 className="display display-lg">Welcome</h1>
        <p className="mt-3 text-muted">Sign in to set up your profile.</p>
        <div className="mt-4"><SignInPanel /></div>
      </div>
    );
  // Already set up (including the moment right after saving): carry on to where they were going,
  // or to the editor if they opened this screen directly.
  if (me.user.username) return <Navigate to={params.has("next") ? next : "/me/edit"} replace />;

  return (
    <div className="wrap pt-6">
      <h1 className="display display-lg">Welcome to NimStage</h1>
      <p className="mb-5 mt-3 text-lg text-muted">Choose a username and make your profile yours. It takes a minute, and you can change nearly everything later.</p>
      <ProfileEditor mode="welcome" next={next} />
    </div>
  );
}
