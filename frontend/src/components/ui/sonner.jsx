import { Toaster as Sonner, toast } from "sonner"

// Toasts « verre dépoli » Postorico : fond translucide + blur, icône en pastille
// colorée par type. Le style vit dans index.css (.postorico-toast) ; on garde les
// animations natives de sonner (entrée/sortie, empilage, swipe), seuls les visuels changent.
const Toaster = ({
  ...props
}) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "postorico-toast",
        },
      }}
      {...props} />
  );
}

export { Toaster, toast }
