import RAPIER from "@dimforge/rapier2d-compat";
import Victor from "victor";
import { Game, Object } from "./Game";
import { Hero } from "./Hero";
import { Planet } from "./Planet";
import { drawCuboid, getDirection, random } from "./utils";

const ITEM_SIZE = 30

export class Item implements Object {
  public body: RAPIER.RigidBody;
  public collider: RAPIER.Collider;
  public mass: number;
  public color = "#FF0000";

  constructor(private game: Game, planet: Planet) {
    const planetCenter = Victor.fromObject(planet.body.translation());


    const planetRadius = (planet.collider.shape as RAPIER.Ball).radius;

    const randomDirection = new Victor(planetRadius + ITEM_SIZE, 0).rotateDeg(
      random(0, 360)
    );

    const position = planetCenter.add(randomDirection);

    const direction = getDirection(planetCenter, position);

    console.log(direction)

    this.body = this.game.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y)
        .setRotation(direction)
    );

    this.collider = this.game.world.createCollider(
      RAPIER.ColliderDesc.cuboid(ITEM_SIZE, ITEM_SIZE)
        .setDensity(100)
        .setFriction(0.5)
        .setRestitution(0.5)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body
    );

    this.mass = this.body.mass();

    this.body.userData = this;

    this.game.objects.push(this)
  }

  loop() {}

  draw() {
    const position = this.body.translation();
    const halfExtents = (this.collider.shape as RAPIER.Cuboid).halfExtents;
    drawCuboid(
      this.game.ctx,
      position,
      halfExtents,
      this.color,
      this.body.rotation()
    );
  }

  destroy() {
    this.game.world.removeCollider(this.collider, false);
    this.game.world.removeRigidBody(this.body);
    this.game.objects.splice(this.game.objects.indexOf(this), 1);
  }

  handleCollisionWith(object: Object, magnitude: number) {
    if (object instanceof Hero) {
      this.destroy();
    }
  }
}
