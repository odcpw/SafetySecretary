import { createElement, type ImgHTMLAttributes } from "react";

type NextImageStubProps = ImgHTMLAttributes<HTMLImageElement> & {
	readonly loader?: unknown;
	readonly priority?: boolean;
	readonly quality?: number | string;
	readonly unoptimized?: boolean;
};

export default function NextImageStub({
	loader: _loader,
	priority: _priority,
	quality: _quality,
	unoptimized: _unoptimized,
	...props
}: NextImageStubProps) {
	return createElement("img", props);
}
