import "react";

declare module "react" {
  interface HTMLAttributes<T> {
    "box-"?: string;
  }
}
