import { SignInPanel } from "@/components/auth";
import { ProfileEditor } from "@/components/profile-editor";
import { Skeleton } from "@/components/skeleton";
import { useWallet } from "@/lib/wallet";
import { useTitle } from "@/lib/use-now";

export default function EditProfilePage() {
  useTitle("Edit profile");
  const { me, loading } = useWallet();
  return (
    <div className="wrap pt-6">
      <h1 className="display display-lg mb-5">Edit profile</h1>
      {loading ? <Skeleton className="h-40 w-full" /> : !me?.user ? <SignInPanel /> : <ProfileEditor mode="edit" next="/me" />}
    </div>
  );
}
