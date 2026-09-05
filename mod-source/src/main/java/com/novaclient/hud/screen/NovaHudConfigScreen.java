package com.novaclient.hud.screen;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;

public class NovaHudConfigScreen extends Screen {
    private final Screen parent;

    public NovaHudConfigScreen(Screen parent) {
        super(Text.literal("Nova HUD Settings (Lunar Style)"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        super.init();
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        this.renderBackground(context, mouseX, mouseY, delta);
        context.drawCenteredTextWithShadow(this.textRenderer, this.title, this.width / 2, 30, 0x00FFFF);
        
        // Draw preview instructions
        context.drawCenteredTextWithShadow(this.textRenderer, Text.literal("Lunar Client Style In-Game HUD is Active!"), this.width / 2, 70, 0xFFFFFF);
        context.drawCenteredTextWithShadow(this.textRenderer, Text.literal("Press ESC to return to game. HUD elements (CPS, FPS, Armor, Keystrokes) render automatically."), this.width / 2, 95, 0xAAAAAA);

        super.render(context, mouseX, mouseY, delta);
    }

    @Override
    public void close() {
        this.client.setScreen(this.parent);
    }
}
