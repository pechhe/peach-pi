import { Dialog as SheetPrimitive } from "bits-ui";
import Content from "./sheet-content.svelte";
import Header from "./sheet-header.svelte";
import Overlay from "./sheet-overlay.svelte";
import Title from "./sheet-title.svelte";

const Root = SheetPrimitive.Root;
const Close = SheetPrimitive.Close;
const Trigger = SheetPrimitive.Trigger;

export {
  Root,
  Close,
  Trigger,
  Content,
  Header,
  Overlay,
  Title,
  //
  Root as Sheet,
  Close as SheetClose,
  Trigger as SheetTrigger,
  Content as SheetContent,
  Header as SheetHeader,
  Overlay as SheetOverlay,
  Title as SheetTitle,
};
