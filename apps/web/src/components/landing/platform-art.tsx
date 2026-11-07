import { BrandIcon } from "./brand-icon";

export function PlatformArt() {
  return (
    <div className="platform-art" aria-hidden="true">
      <div className="platform-orbit orbit-one" />
      <div className="platform-orbit orbit-two" />
      <div className="platform-orbit orbit-three" />
      <div className="platform-slab slab-web">
        <div className="slab-window-bar">
          <i />
          <i />
          <i />
        </div>
        <BrandIcon name="Web" />
      </div>
      <div className="platform-slab slab-mobile">
        <div className="slab-island" />
        <BrandIcon name="Apple" />
        <BrandIcon name="Android" />
        <div className="slab-home" />
      </div>
      <div className="platform-slab slab-desktop">
        <BrandIcon name="Windows" />
        <BrandIcon name="Linux" />
      </div>
      <div className="platform-hub">
        <img src="/disposabl-logo.svg" alt="" />
      </div>
      <div className="platform-node node-react">
        <BrandIcon name="React" />
      </div>
      <div className="platform-node node-mcp">
        <BrandIcon name="MCP" />
      </div>
    </div>
  );
}
